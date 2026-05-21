// APIClient.swift
// Single HTTP client used by every ViewModel. URLSession-based — no
// Alamofire — because Apple's stack is plenty for a REST app and saves
// us a dependency.
//
// Decisions:
//   - One shared instance (`APIClient.shared`) so the URLSession and
//     decoder are reused. Tests inject a custom one with a mock session.
//   - Base URL comes from APIConfig so it survives `xcodegen generate`.
//   - Decoder uses ISO8601 + fractional seconds (NestJS / Drizzle defaults).
//   - Auth token is read from TokenStore on every call. Easy to revoke.
//   - All errors are wrapped into APIError with a status code so views
//     can show meaningful messages.
//   - Errors are reported to MonitoringService automatically, EXCEPT when
//     the request is itself a monitoring call (path begins with `/ops/`).
//     Detecting this inside the client (rather than via a parameter on
//     every public method) keeps the call sites clean.

import Foundation

actor APIClient {
    static let shared = APIClient()

    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let tokenStore: TokenStore

    init(
        baseURL: URL? = nil,
        session: URLSession = .shared,
        tokenStore: TokenStore = .shared
    ) {
        // Tests can pass an explicit baseURL. Otherwise APIConfig handles the
        // resolution (UserDefaults > env > Info.plist > localhost).
        self.baseURL = baseURL ?? APIConfig.baseURL
        self.session = session
        self.tokenStore = tokenStore
        self.decoder = Self.makeDecoder()
        self.encoder = Self.makeEncoder()
    }

    // ── HTTP verbs ───────────────────────────────────────────────────────

    func get<T: Decodable>(
        _ path: String,
        as type: T.Type = T.self,
        requiresAuth: Bool = true
    ) async throws -> T {
        try await request(path: path, method: "GET", body: Optional<EmptyBody>.none, as: type, requiresAuth: requiresAuth)
    }

    func post<B: Encodable, T: Decodable>(
        _ path: String,
        body: B,
        as type: T.Type = T.self,
        requiresAuth: Bool = true
    ) async throws -> T {
        try await request(path: path, method: "POST", body: body, as: type, requiresAuth: requiresAuth)
    }

    func patch<B: Encodable, T: Decodable>(
        _ path: String,
        body: B,
        as type: T.Type = T.self,
        requiresAuth: Bool = true
    ) async throws -> T {
        try await request(path: path, method: "PATCH", body: body, as: type, requiresAuth: requiresAuth)
    }

    func delete<T: Decodable>(
        _ path: String,
        as type: T.Type = T.self,
        requiresAuth: Bool = true
    ) async throws -> T {
        try await request(path: path, method: "DELETE", body: Optional<EmptyBody>.none, as: type, requiresAuth: requiresAuth)
    }

    // ── Core ─────────────────────────────────────────────────────────────

    private func request<B: Encodable, T: Decodable>(
        path: String,
        method: String,
        body: B?,
        as: T.Type,
        requiresAuth: Bool,
        isRetry: Bool = false
    ) async throws -> T {
        // Monitoring posts (/ops/*) must never report their own failures —
        // it would cause a loop when the network is down. Same for /auth/*
        // because auth failures are already reported by AuthSession itself.
        let suppressMonitoring = pathIsInternal(path)

        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw report(APIError.invalidURL, path: path, method: method, suppressed: suppressMonitoring)
        }

        // Block until JWT exists. Skipped for /auth/* so dev sign-in can
        // bootstrap without a circular dependency.
        if requiresAuth {
            try await AuthSession.shared.ensureToken()
        }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        if requiresAuth, let token = await tokenStore.token() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try encoder.encode(body)
        }

        // Run the request. Network-level failures throw here.
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw report(.transport(error), path: path, method: method, suppressed: suppressMonitoring)
        }

        guard let http = response as? HTTPURLResponse else {
            throw report(.invalidResponse, path: path, method: method, suppressed: suppressMonitoring)
        }

        // One retry: token may have expired or bootstrap raced on cold start.
        if http.statusCode == 401, requiresAuth, !isRetry {
            try await AuthSession.shared.refresh()
            return try await request(
                path: path,
                method: method,
                body: body,
                as: `as`,
                requiresAuth: requiresAuth,
                isRetry: true
            )
        }

        guard (200..<300).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8)
            throw report(
                .status(code: http.statusCode, body: detail),
                path: path,
                method: method,
                suppressed: suppressMonitoring
            )
        }

        // Many DELETE endpoints return 204 No Content; let callers ask for
        // EmptyResponse instead of forcing a useless decode.
        if data.isEmpty, let empty = EmptyResponse() as? T {
            return empty
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw report(.decode(error), path: path, method: method, suppressed: suppressMonitoring)
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    /// Forwards the error to MonitoringService unless `suppressed` is true.
    /// Returns the same error so callers can `throw report(...)` in one line.
    private func report(
        _ error: APIError,
        path: String,
        method: String,
        suppressed: Bool
    ) -> APIError {
        if !suppressed {
            // Fire-and-forget: don't block the request thread on monitoring.
            Task { await MonitoringService.shared.recordAPIError(error, path: path, method: method) }
        }
        return error
    }

    /// True when this request is something we must NOT report back to the
    /// monitoring endpoint — would either create a loop or duplicate signal.
    private func pathIsInternal(_ path: String) -> Bool {
        path.hasPrefix("/ops/") || path.hasPrefix("/auth/")
    }

    private static func makeDecoder() -> JSONDecoder {
        let dec = JSONDecoder()
        // Backend returns timestamptz like "2026-04-28T20:00:00.000Z".
        // Some columns omit fractional seconds — handle both shapes.
        let isoFmt = ISO8601DateFormatter()
        isoFmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoFmtNoFrac = ISO8601DateFormatter()
        isoFmtNoFrac.formatOptions = [.withInternetDateTime]
        dec.dateDecodingStrategy = .custom { d in
            let str = try d.singleValueContainer().decode(String.self)
            if let date = isoFmt.date(from: str) ?? isoFmtNoFrac.date(from: str) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: try d.singleValueContainer(),
                debugDescription: "Unrecognized date: \(str)"
            )
        }
        return dec
    }

    private static func makeEncoder() -> JSONEncoder {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        return enc
    }
}

// Shared empty types used by request helpers above.
struct EmptyBody: Encodable {}
struct EmptyResponse: Decodable {}

// MARK: - Errors

enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case transport(Error)
    case status(code: Int, body: String?)
    case decode(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Bad URL"
        case .invalidResponse: return "Server returned an unexpected response"
        case .transport(let e): return "Network error: \(e.localizedDescription)"
        case .status(let code, let body):
            return "HTTP \(code): \(body ?? "no body")"
        case .decode(let e): return "Decode failed: \(e.localizedDescription)"
        }
    }
}
