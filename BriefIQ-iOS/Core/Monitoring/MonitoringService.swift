// MonitoringService.swift
// Central place for client-side logging and error reporting.
//
// Responsibilities:
//   - Mirror every event to OSLog so Xcode Console / Console.app pick it up.
//   - Keep a tiny last-error string for the Settings diagnostics card.
//   - Optionally ship warn/error events to POST /ops/events on the backend.
//
// Design notes:
//   - This is an actor: lastError + the in-memory log are shared across the
//     app. Actor isolation keeps writes serial without manual locking.
//   - Backend posts are fire-and-forget. If POST /ops/events fails we log
//     locally but never recurse — APIClient already suppresses monitoring
//     for /ops/* paths so we can't loop forever.
//   - Transport errors are NEVER posted. If the network is the problem,
//     posting more network is wasted work and pollutes the timeline.

import Foundation
import OSLog

actor MonitoringService {
    static let shared = MonitoringService()

    // OSLog gets a friendly subsystem so logs are filterable in Console.app.
    private let log = Logger(subsystem: "com.briefiq.app", category: "BriefIQ")

    /// Most recent error message shown in Settings → Diagnostics.
    private(set) var lastError: String?

    /// Records an event. Warn/error update `lastError`; warn/error are also
    /// shipped to the backend unless `reportToBackend` is false (e.g. for
    /// auth-bootstrap failures, which would just fail again).
    func record(
        _ level: ClientEventLevel,
        _ message: String,
        context: [String: String] = [:],
        reportToBackend: Bool = true
    ) {
        writeToOSLog(level, message: message, context: context)

        if level == .warn || level == .error {
            lastError = message
        }

        guard reportToBackend, level == .warn || level == .error else { return }

        // Spawn a child task that runs on the same actor; the outer caller
        // doesn't wait for the network round-trip.
        Task { await self.shipToBackend(level: level, message: message, context: context) }
    }

    /// Convenience wrapper for APIClient failures. Skips backend reporting
    /// for transport errors — if the network is down, posting to /ops will
    /// also fail and isn't useful signal.
    func recordAPIError(_ error: APIError, path: String, method: String) {
        var context: [String: String] = [
            "path": path,
            "method": method,
        ]

        let message: String
        var isTransport = false

        switch error {
        case .invalidURL:
            message = "Invalid URL for \(method) \(path)"
        case .invalidResponse:
            message = "Invalid response from \(method) \(path)"
        case .transport(let underlying):
            // Most common cause: backend unreachable, ATS blocked, wrong LAN IP.
            // Strip the long URLError description down to the readable part.
            message = "Network error on \(method) \(path): \(underlying.localizedDescription)"
            context["underlying"] = String(describing: underlying)
            isTransport = true
        case .status(let code, let body):
            message = "HTTP \(code) on \(method) \(path)"
            context["statusCode"] = String(code)
            if let body, !body.isEmpty {
                // Truncate so we don't ship 1MB error pages.
                context["body"] = String(body.prefix(500))
            }
        case .decode(let underlying):
            message = "Decode failed for \(method) \(path)"
            context["underlying"] = underlying.localizedDescription
        }

        record(.error, message, context: context, reportToBackend: !isTransport)
    }

    /// Returns the latest error string. Used by Settings → Diagnostics.
    func lastErrorMessage() -> String? { lastError }

    /// Test helper — clears the cached last-error string.
    func resetForTesting() {
        lastError = nil
    }

    // ── Private ───────────────────────────────────────────────────────────

    private func writeToOSLog(
        _ level: ClientEventLevel,
        message: String,
        context: [String: String]
    ) {
        // OSLog auto-formats dictionaries badly, so render them ourselves.
        let suffix = context.isEmpty ? "" : " " + describe(context)
        let line = message + suffix

        switch level {
        case .debug:
            log.debug("\(line, privacy: .public)")
        case .info:
            log.info("\(line, privacy: .public)")
        case .warn:
            log.warning("\(line, privacy: .public)")
        case .error:
            log.error("\(line, privacy: .public)")
        }
    }

    private func shipToBackend(
        level: ClientEventLevel,
        message: String,
        context: [String: String]
    ) async {
        let payload = ClientEventPayload(
            level: level,
            message: message,
            context: context.isEmpty ? nil : context
        )
        do {
            try await OpsAPI.postEvents([payload])
        } catch {
            // Swallow — we already have the local OSLog line. Reporting
            // this failure back to ourselves would loop, so just whisper.
            log.debug("ops ingest skipped: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Render context dictionaries in a stable, human-readable form.
    private func describe(_ dict: [String: String]) -> String {
        let pairs = dict.keys.sorted().map { "\($0)=\(dict[$0] ?? "")" }
        return "[" + pairs.joined(separator: " ") + "]"
    }
}
