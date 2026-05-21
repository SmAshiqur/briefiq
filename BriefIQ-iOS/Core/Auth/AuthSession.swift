// AuthSession.swift
// Ensures a JWT exists before any authenticated API call.
//
// Problem this solves:
//   AppRouter.task { ensureToken() } races with FeedView.task { load() }
//   and QueryDetailView.task { load() }. Views fire before the token lands
//   in Keychain → 401 on every request. APIClient calls ensureToken() at
//   the start of every authenticated request to block this race.
//
// Two refinements on top of the basic dedupe:
//   1. Concurrent callers share one in-flight bootstrap Task so we POST
//      /auth/dev once on cold start, not once per view.
//   2. A short failure cooldown: if /auth/dev fails (e.g. backend not
//      reachable after `xcodegen generate` wiped the scheme env var) we
//      cache the failure for `failureCooldown` seconds and rethrow without
//      hitting the network. That keeps the log readable instead of one
//      "Network error" line per ViewModel task on every render.

import Foundation

enum AuthSessionError: Error, LocalizedError {
    case devSignInFailed(String)

    var errorDescription: String? {
        switch self {
        case .devSignInFailed(let detail):
            return "Dev sign-in failed: \(detail)"
        }
    }
}

actor AuthSession {
    static let shared = AuthSession()

    /// Don't retry a failing /auth/dev more often than this. Keeps the UI
    /// responsive while preventing log spam when the backend is down.
    private let failureCooldown: TimeInterval = 5

    /// In-flight bootstrap Task. Concurrent callers join this one task.
    private var bootstrapTask: Task<Void, Error>?

    /// Most recent failure timestamp; we short-circuit until cooldown elapses.
    private var lastFailureAt: Date?
    private var lastFailureError: Error?

    /// Returns immediately if Keychain already has a token. Otherwise runs
    /// POST /auth/dev once. Throws the cached failure during cooldown so
    /// callers fail fast without another network round-trip.
    func ensureToken() async throws {
        if await TokenStore.shared.token() != nil { return }

        if let cached = cachedFailure() {
            throw cached
        }

        try await bootstrapIfNeeded()
    }

    /// Clear Keychain and obtain a fresh JWT. Used after a 401 from any
    /// authenticated endpoint. Resets the failure cooldown so we try again
    /// immediately — the user just did something deliberate.
    func refresh() async throws {
        await TokenStore.shared.clear()
        bootstrapTask?.cancel()
        bootstrapTask = nil
        lastFailureAt = nil
        lastFailureError = nil
        try await bootstrapIfNeeded()
    }

    // ── Private ───────────────────────────────────────────────────────────

    /// Returns the cached failure if we're still inside the cooldown window.
    private func cachedFailure() -> Error? {
        guard
            let at = lastFailureAt,
            Date().timeIntervalSince(at) < failureCooldown,
            let err = lastFailureError
        else {
            return nil
        }
        return err
    }

    private func bootstrapIfNeeded() async throws {
        // Join any in-flight bootstrap so we don't POST /auth/dev twice.
        if let existing = bootstrapTask {
            try await existing.value
            return
        }

        let task = Task<Void, Error> { [weak self] in
            guard let self else { return }
            do {
                let response = try await AuthAPI.devSignIn(handle: "dev-user")
                await TokenStore.shared.setToken(response.token)
                guard await TokenStore.shared.token() != nil else {
                    throw AuthSessionError.devSignInFailed("token not persisted to Keychain")
                }
            } catch {
                // Log once per failure, then start the cooldown.
                await MonitoringService.shared.record(
                    .error,
                    "Dev sign-in failed: \(error.localizedDescription)",
                    context: ["stage": "auth/bootstrap"],
                    reportToBackend: false
                )
                await self.markFailure(error)
                throw error
            }
        }
        bootstrapTask = task
        defer { bootstrapTask = nil }
        try await task.value
    }

    /// Records a failure so subsequent calls short-circuit during cooldown.
    private func markFailure(_ error: Error) {
        lastFailureAt = Date()
        lastFailureError = error
    }
}
