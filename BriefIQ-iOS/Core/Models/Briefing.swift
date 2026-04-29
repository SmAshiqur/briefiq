// Briefing.swift
// Mirrors `briefings` table + the join shape returned by GET /briefings/today.

import Foundation

struct Briefing: Codable, Identifiable, Hashable {
    let id: UUID
    let queryId: UUID
    // Joined from `queries.raw_text` so the iOS feed card can show the
    // original question alongside the summary.
    let queryText: String
    let importance: Importance
    let summary: String
    let deltaVerdict: String
    let sources: SourcesPayload?
    let deliveredAt: Date?
    let createdAt: Date

    enum Importance: String, Codable, CaseIterable {
        case important   // red — push immediately if not in quiet hours
        case new         // green — informational
        case minor       // amber — digest-only
    }

    struct SourcesPayload: Codable, Hashable {
        let domains: [String]
    }

    enum CodingKeys: String, CodingKey {
        case id
        case queryId
        case queryText
        case importance
        case summary
        case deltaVerdict
        case sources = "sourcesJson"
        case deliveredAt
        case createdAt
    }
}

// "Still monitoring" payload — queries that ran but didn't produce a
// briefing in the last 24h. Drives the reassurance block on the feed.
struct StillMonitoringQuery: Codable, Identifiable, Hashable {
    let id: UUID
    let rawText: String
    let frequency: Query.Frequency
    let lastCheckedAt: Date?
    let nextCheckAt: Date?
}

// Top-level shape of GET /briefings/today.
struct TodayFeed: Codable, Hashable {
    let changes: [Briefing]
    let stillMonitoring: [StillMonitoringQuery]
    let counts: Counts

    struct Counts: Codable, Hashable {
        let updatesToday: Int
        let noChange: Int
        let running: Int
    }
}
