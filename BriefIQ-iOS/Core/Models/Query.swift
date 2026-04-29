// Query.swift
// Mirrors `queries` table from briefiq-api/src/db/schema.ts.
//
// CodingKeys map snake_case JSON to Swift's camelCase. Decisions on what's
// optional follow the backend nullable columns.

import Foundation

struct Query: Codable, Identifiable, Hashable {
    let id: UUID
    let userId: UUID
    let rawText: String
    let intentType: IntentType
    let frequency: Frequency
    let signalThreshold: Threshold?
    let status: Status
    let sources: SourcesPayload?
    let createdAt: Date
    let lastCheckedAt: Date?
    let nextCheckAt: Date?

    enum IntentType: String, Codable, CaseIterable {
        case trend, event, policy, listing, price, other
    }

    enum Frequency: String, Codable, CaseIterable {
        case hourly, daily, weekly
    }

    enum Threshold: String, Codable, CaseIterable {
        case loose, balanced, strict
    }

    enum Status: String, Codable, CaseIterable {
        case active, paused, archived
    }

    struct SourcesPayload: Codable, Hashable {
        let domains: [String]
    }

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "userId"
        case rawText = "rawText"
        case intentType = "intentType"
        case frequency
        case signalThreshold = "signalThreshold"
        case status
        case sources = "sourcesJson"
        case createdAt = "createdAt"
        case lastCheckedAt = "lastCheckedAt"
        case nextCheckAt = "nextCheckAt"
    }
}

// AI parse result returned by POST /queries/analyze. Matches the Zod schema
// `QueryUnderstanding` in services/llm.service.ts.
struct QueryUnderstanding: Codable, Hashable {
    let intent: Query.IntentType
    let signalDefinition: String
    let suggestedSources: [String]
    let suggestedFrequency: Query.Frequency

    enum CodingKeys: String, CodingKey {
        case intent
        case signalDefinition = "signal_definition"
        case suggestedSources = "suggested_sources"
        case suggestedFrequency = "suggested_frequency"
    }
}
