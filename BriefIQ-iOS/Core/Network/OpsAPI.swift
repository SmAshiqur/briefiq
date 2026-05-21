// OpsAPI.swift
// Tiny wrapper around POST /ops/events.
//
// Implemented as an enum with a static method because there is no per-call
// state to keep. APIClient.shared handles auth, retries, and base URL.
// APIClient deliberately suppresses monitoring for any path beginning with
// `/ops/`, so the call below cannot loop on a network failure.

import Foundation

enum OpsAPI {
    @discardableResult
    static func postEvents(
        _ events: [ClientEventPayload]
    ) async throws -> CreateClientEventsResponse {
        try await APIClient.shared.post(
            "/ops/events",
            body: CreateClientEventsBody(events: events),
            as: CreateClientEventsResponse.self
        )
    }
}
