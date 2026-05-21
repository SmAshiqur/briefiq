// OpsAPI.swift
// Thin wrapper for monitoring endpoints.

import Foundation

struct OpsAPI {
    private let client: APIClient

    init(client: APIClient = .shared) {
        self.client = client
    }

    func postEvents(_ events: [ClientEventPayload]) async throws -> CreateClientEventsResponse {
        try await client.post(
            "/ops/events",
            body: CreateClientEventsBody(events: events),
            as: CreateClientEventsResponse.self,
            requiresAuth: true,
            skipMonitoring: true
        )
    }
}
