// BriefingsAPI.swift
// Domain-specific wrappers around APIClient. ViewModels call these instead
// of building paths inline — keeps URL strings out of the UI layer and
// gives us one place to update if the API contract shifts.

import Foundation

enum BriefingsAPI {
    static func today() async throws -> TodayFeed {
        try await APIClient.shared.get("/briefings/today", as: TodayFeed.self)
    }

    static func detail(_ id: UUID) async throws -> Briefing {
        try await APIClient.shared.get("/briefings/\(id.uuidString.lowercased())", as: Briefing.self)
    }

    static func forQuery(_ queryId: UUID) async throws -> [Briefing] {
        try await APIClient.shared.get(
            "/briefings/query/\(queryId.uuidString.lowercased())",
            as: [Briefing].self
        )
    }

    static func feedback(briefingID: UUID, rating: Feedback.Rating) async throws -> Feedback {
        struct Body: Encodable { let rating: String }
        return try await APIClient.shared.post(
            "/briefings/\(briefingID.uuidString.lowercased())/feedback",
            body: Body(rating: rating.rawValue),
            as: Feedback.self
        )
    }
}

enum QueriesAPI {
    static func getOne(_ id: UUID) async throws -> Query {
        try await APIClient.shared.get("/queries/\(id.uuidString.lowercased())", as: Query.self)
    }

    static func analyze(text: String) async throws -> QueryUnderstanding {
        struct Body: Encodable { let text: String }
        return try await APIClient.shared.post(
            "/queries/analyze",
            body: Body(text: text),
            as: QueryUnderstanding.self
        )
    }

    static func list() async throws -> [Query] {
        try await APIClient.shared.get("/queries", as: [Query].self)
    }

    struct CreateBody: Encodable {
        let rawText: String
        let intentType: String
        let frequency: String
        let sources: SourcesPayload?
        let signalThreshold: String?

        struct SourcesPayload: Encodable {
            let domains: [String]
        }
    }

    static func create(_ body: CreateBody) async throws -> Query {
        try await APIClient.shared.post("/queries", body: body, as: Query.self)
    }

    struct UpdateBody: Encodable {
        var status: String?
        var frequency: String?
        var signalThreshold: String?
    }

    static func update(_ id: UUID, _ body: UpdateBody) async throws -> Query {
        try await APIClient.shared.patch(
            "/queries/\(id.uuidString.lowercased())",
            body: body,
            as: Query.self
        )
    }

    @discardableResult
    static func delete(_ id: UUID) async throws -> EmptyResponse {
        try await APIClient.shared.delete(
            "/queries/\(id.uuidString.lowercased())",
            as: EmptyResponse.self
        )
    }
}

enum SettingsAPI {
    static func get() async throws -> UserSettings {
        try await APIClient.shared.get("/settings", as: UserSettings.self)
    }

    static func update(_ body: UpdateSettingsBody) async throws -> UserSettings {
        try await APIClient.shared.patch("/settings", body: body, as: UserSettings.self)
    }
}

enum AuthAPI {
    struct DevSignInBody: Encodable { let handle: String }
    struct SignInResponse: Decodable {
        let token: String
        let user: AuthUser
        struct AuthUser: Decodable {
            let id: UUID
            let appleSub: String
            let email: String?
        }
    }

    /// Dev shortcut. Use during prototype iteration on Windows.
    static func devSignIn(handle: String) async throws -> SignInResponse {
        try await APIClient.shared.post(
            "/auth/dev",
            body: DevSignInBody(handle: handle),
            as: SignInResponse.self,
            requiresAuth: false
        )
    }
}
