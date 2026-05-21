// APIClient.swift
// Single HTTP client used by every ViewModel. URLSession-based — no
// Alamofire — because Apple's stack is plenty for a REST app and saves
// us a dependency.
//
// Decisions:
//   - One shared instance (`APIClient.shared`) so the URLSession and
//     decoder are reused. Tests inject a custom one with a mock session.
//   - Decoder uses ISO8601 + fractional seconds (NestJS / Drizzle defaults).
//   - Auth token is read from TokenStore on every call. Easy to revoke.
//   - All errors are wrapped into APIError with a status code so views
//     can show meaningful messages.

import Foundation

actor APIClient {
    static let shared = APIClient()

    /// Base URL of the BriefIQ API. Override per-environment via the
    /// BRIEFIQ_API_BASE_URL env var (set in Xcode scheme), otherwise
    /// defaults to local dev.
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
        // Order: explicit override -> env var -> localhost dev default.
        if let baseURL {
            self.baseURL = baseURL
        } else if let raw = ProcessInfo.processInfo.environment["BRIEFIQ_API_BASE_URL"],
                  let url = URL(string: raw) {
            self.baseURL = url
        } else {
            self.baseURL = URL(string: "http://localhost:3000")!
        }
        self.session = session
        self.tokenStore = tokenStore

        let dec = JSONDecoder()
        // The backend returns timestamptz like "2026-04-28T20:00:00.000Z".
        // ISO8601DateFormatter with fractional seconds handles both shapes.
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
        self.decoder = dec

        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        self.encoder = enc
    }

    // ── HTTP verbs ───────────────────────────────────────────────────────

    func get<T: Decodable>(
        _ path: String,
        as type: T.Type = T.self,
        requiresAuth: Bool = true,
        skipMonitoring: Bool = false
    ) async throws -> T {
        try await request(path: path, method: "GET", body: Optional<EmptyBody>.none, as: type, requiresAuth: requiresAuth, skipMonitoring: skipMonitoring)
    }

    func post<B: Encodable, T: Decodable>(
        _ path: String,
        body: B,
        as type: T.Type = T.self,
        requiresAuth: Bool = true,
        skipMonitoring: Bool = false
    ) async throws -> T {
        try await request(path: path, method: "POST", body: body, as: type, requiresAuth: requiresAuth, skipMonitoring: skipMonitoring)
    }

    func patch<B: Encodable, T: Decodable>(
        _ path: String,
        body: B,
        as type: T.Type = T.self,
        requiresAuth: Bool = true,
        skipMonitoring: Bool = false
    ) async throws -> T {
        try await request(path: path, method: "PATCH", body: body, as: type, requiresAuth: requiresAuth, skipMonitoring: skipMonitoring)
    }

    func delete<T: Decodable>(
        _ path: String,
        as type: T.Type = T.self,
        requiresAuth: Bool = true,
        skipMonitoring: Bool = false
    ) async throws -> T {
        try await request(path: path, method: "DELETE", body: Optional<EmptyBody>.none, as: type, requiresAuth: requiresAuth, skipMonitoring: skipMonitoring)
    }

    // ── Core ─────────────────────────────────────────────────────────────

    private func request<B: Encodable, T: Decodable>(
        path: String,
        method: String,
        body: B?,
        as: T.Type,
        requiresAuth: Bool,
        skipMonitoring: Bool,
        isRetry: Bool = false
    ) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            let err = APIError.invalidURL
            if !skipMonitoring {
                await MonitoringService.shared.recordAPIError(err, path: path, method: method)
            }
            throw err
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

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            let err = APIError.transport(error)
            if !skipMonitoring {
                await MonitoringService.shared.recordAPIError(err, path: path, method: method)
            }
            throw err
        }

        guard let http = response as? HTTPURLResponse else {
            let err = APIError.invalidResponse
            if !skipMonitoring {
                await MonitoringService.shared.recordAPIError(err, path: path, method: method)
            }
            throw err
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
                skipMonitoring: skipMonitoring,
                isRetry: true
            )
        }

        guard (200..<300).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8)
            let err = APIError.status(code: http.statusCode, body: detail)
            if !skipMonitoring {
                await MonitoringService.shared.recordAPIError(err, path: path, method: method)
            }
            throw err
        }

        if data.isEmpty, let empty = EmptyResponse() as? T {
            return empty
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            let err = APIError.decode(error)
            if !skipMonitoring {
                await MonitoringService.shared.recordAPIError(err, path: path, method: method)
            }
            throw err
        }
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
