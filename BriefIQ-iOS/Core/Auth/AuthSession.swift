// AuthSession.swift
// Ensures a JWT exists before any authenticated API call.
//
// Problem this solves: AppRouter.task { ensureDevToken() } races with
// FeedView.task { load() } and QueryDetailView.task { load() }. Views
// fire before the token lands in Keychain → 401 on every request.
//
// APIClient calls ensureToken() before attaching Authorization. Concurrent
// callers share one in-flight bootstrap Task so we don't POST /auth/dev
// three times on cold start.

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

    /// In-flight bootstrap. Nil when idle.
    private var bootstrapTask: Task<Void, Error>?

    /// Returns immediately if Keychain already has a token. Otherwise runs
    /// POST /auth/dev once (deduped across concurrent waiters).
    func ensureToken() async throws {
        if await TokenStore.shared.token() != nil { return }
        try await bootstrapIfNeeded()
    }

    /// Clear Keychain and obtain a fresh JWT. Used after 401.
    func refresh() async throws {
        await TokenStore.shared.clear()
        bootstrapTask?.cancel()
        bootstrapTask = nil
        try await bootstrapIfNeeded()
    }

    private func bootstrapIfNeeded() async throws {
        if let existing = bootstrapTask {
            try await existing.value
            return
        }

        let task = Task<Void, Error> {
            do {
                let response = try await AuthAPI.devSignIn(handle: "dev-user")
                await TokenStore.shared.setToken(response.token)
                guard await TokenStore.shared.token() != nil else {
                    throw AuthSessionError.devSignInFailed("token not persisted to Keychain")
                }
            } catch {
                await MonitoringService.shared.record(
                    .error,
                    "Dev sign-in failed: \(error.localizedDescription)",
                    context: ["stage": "auth/bootstrap"],
                    reportToBackend: false
                )
                throw error
            }
        }
        bootstrapTask = task
        defer { bootstrapTask = nil }
        try await task.value
    }
}
