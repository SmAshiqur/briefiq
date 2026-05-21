// MonitoringService.swift
// Central place for client-side logging and error reporting.
//
// - OSLog for Xcode Console / Instruments
// - POST /ops/events for server-side timeline (warn + error by default)
// - Keeps lastError for the Settings diagnostics card
//
// Fire-and-forget backend posts — never blocks UI or retries forever.

import Foundation
import OSLog

actor MonitoringService {
    static let shared = MonitoringService()

    private let log = Logger(subsystem: "com.briefiq.app", category: "BriefIQ")
    private let ops = OpsAPI()
    private var lastError: String?

    /// Most recent user-visible error (API, auth, decode, etc.).
    func lastErrorMessage() -> String? {
        lastError
    }

    /// Record a general app event.
    func record(
        _ level: ClientEventLevel,
        _ message: String,
        context: [String: String] = [:],
        reportToBackend: Bool = true
    ) {
        writeToOSLog(level, message, context: context)

        if level == .error || level == .warn {
            lastError = message
        }

        // Only ship warn/error to the backend — info/debug stay local.
        guard reportToBackend, level == .warn || level == .error else { return }

        Task {
            await self.sendToBackend([
                ClientEventPayload(level: level, message: message, context: context.isEmpty ? nil : context)
            ])
        }
    }

    /// Convenience wrapper for APIClient failures.
    func recordAPIError(_ error: APIError, path: String, method: String) {
        let message: String
        var context: [String: String] = [
            "path": path,
            "method": method,
        ]

        switch error {
        case .invalidURL:
            message = "Invalid URL for \(method) \(path)"
        case .invalidResponse:
            message = "Invalid response from \(method) \(path)"
        case .transport(let underlying):
            message = "Network error on \(method) \(path): \(underlying.localizedDescription)"
            context["underlying"] = String(describing: underlying)
        case .status(let code, let body):
            message = "HTTP \(code) on \(method) \(path)"
            context["statusCode"] = String(code)
            if let body, !body.isEmpty {
                context["body"] = String(body.prefix(500))
            }
        case .decode(let underlying):
            message = "Decode failed for \(method) \(path)"
            context["underlying"] = underlying.localizedDescription
        }

        record(.error, message, context: context)
    }

    // ── Private ───────────────────────────────────────────────────────────

    private func writeToOSLog(
        _ level: ClientEventLevel,
        _ message: String,
        context: [String: String]
    ) {
        let ctx = context.isEmpty ? "" : " \(context)"
        switch level {
        case .debug:
            log.debug("\(message, privacy: .public)\(ctx, privacy: .public)")
        case .info:
            log.info("\(message, privacy: .public)\(ctx, privacy: .public)")
        case .warn:
            log.warning("\(message, privacy: .public)\(ctx, privacy: .public)")
        case .error:
            log.error("\(message, privacy: .public)\(ctx, privacy: .public)")
        }
    }

    private func sendToBackend(_ events: [ClientEventPayload]) async {
        do {
            _ = try await ops.postEvents(events)
        } catch {
            // Avoid infinite loop — log locally only if backend ingest fails.
            log.debug("ops ingest skipped: \(error.localizedDescription, privacy: .public)")
        }
    }
}
