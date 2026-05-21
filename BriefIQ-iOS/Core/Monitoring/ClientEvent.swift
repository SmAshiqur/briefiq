// Payload shapes for POST /ops/events — mirrors backend ClientEventDto.

import Foundation

enum ClientEventLevel: String, Codable, Sendable {
    case debug, info, warn, error
}

struct ClientEventPayload: Codable, Sendable {
    let level: ClientEventLevel
    let message: String
    let context: [String: String]?
}

struct CreateClientEventsBody: Encodable, Sendable {
    let events: [ClientEventPayload]
}

struct CreateClientEventsResponse: Decodable, Sendable {
    let accepted: Int
}
