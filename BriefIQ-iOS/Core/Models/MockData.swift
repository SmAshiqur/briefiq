// MockData.swift
// Sample data for SwiftUI Previews and the offline-first iteration loop.
//
// All values match the dark-mode HTML prototype so the iOS app shows the
// same content as briefiq-prototype.html out of the box.
//
// IMPORTANT: these are NOT used in production code paths. They live here
// so any view can `MockData.feed` without bringing the network up.

import Foundation

enum MockData {
    // Stable UUIDs so re-renders don't churn the diff in previews.
    static let dollarQueryID = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!
    static let internQueryID = UUID(uuidString: "22222222-2222-2222-2222-222222222222")!
    static let buetQueryID = UUID(uuidString: "33333333-3333-3333-3333-333333333333")!
    static let samsungQueryID = UUID(uuidString: "44444444-4444-4444-4444-444444444444")!
    static let startupQueryID = UUID(uuidString: "55555555-5555-5555-5555-555555555555")!
    static let userID = UUID(uuidString: "99999999-9999-9999-9999-999999999999")!

    static let now = Date()

    // ── Queries ──

    static let queries: [Query] = [
        Query(
            id: dollarQueryID,
            userId: userID,
            rawText: "Track dollar rate in Bangladesh",
            intentType: .trend,
            frequency: .daily,
            signalThreshold: .balanced,
            status: .active,
            sources: .init(domains: ["bb.org.bd", "thedailystar.net"]),
            createdAt: now.addingTimeInterval(-86400 * 5),
            lastCheckedAt: now.addingTimeInterval(-7200),  // 2h ago
            nextCheckAt: now.addingTimeInterval(14400)     // in 4h
        ),
        Query(
            id: internQueryID,
            userId: userID,
            rawText: "Dhaka internships this week",
            intentType: .listing,
            frequency: .daily,
            signalThreshold: .balanced,
            status: .active,
            sources: .init(domains: ["bdjobs.com", "linkedin.com"]),
            createdAt: now.addingTimeInterval(-86400 * 3),
            lastCheckedAt: now.addingTimeInterval(-21600), // 6h ago
            nextCheckAt: now.addingTimeInterval(86400)     // tomorrow
        ),
        Query(
            id: buetQueryID,
            userId: userID,
            rawText: "BUET admission info changes",
            intentType: .event,
            frequency: .daily,
            signalThreshold: .balanced,
            status: .active,
            sources: .init(domains: ["admission.buet.ac.bd"]),
            createdAt: now.addingTimeInterval(-86400 * 7),
            lastCheckedAt: now.addingTimeInterval(-43200), // this morning
            nextCheckAt: now.addingTimeInterval(86400)     // tomorrow
        ),
        Query(
            id: samsungQueryID,
            userId: userID,
            rawText: "Samsung launches under ৳50,000",
            intentType: .price,
            frequency: .daily,
            signalThreshold: .balanced,
            status: .active,
            sources: .init(domains: ["samsung.com", "techbangla.com"]),
            createdAt: now.addingTimeInterval(-86400 * 2),
            lastCheckedAt: now.addingTimeInterval(-14400), // 4h ago
            nextCheckAt: now.addingTimeInterval(72000)     // 20h
        ),
        Query(
            id: startupQueryID,
            userId: userID,
            rawText: "Bangladesh startup funding news",
            intentType: .trend,
            frequency: .weekly,
            signalThreshold: .balanced,
            status: .paused,
            sources: .init(domains: ["techbangla.com", "futurestartup.com"]),
            createdAt: now.addingTimeInterval(-86400 * 14),
            lastCheckedAt: now.addingTimeInterval(-86400 * 3),
            nextCheckAt: nil
        ),
    ]

    // ── Briefings ──

    static let briefings: [Briefing] = [
        Briefing(
            id: UUID(),
            queryId: dollarQueryID,
            queryText: "Track dollar rate in Bangladesh",
            importance: .important,
            summary: "Rate rose to 112 BDT today, up from 110 yesterday. Highest level in three weeks — analysts cite rising import demand ahead of Eid.",
            deltaVerdict: "USD/BDT +2.0 BDT day-over-day",
            sources: .init(domains: ["bb.org.bd", "thedailystar.net"]),
            deliveredAt: now.addingTimeInterval(-7200),
            createdAt: now.addingTimeInterval(-7200)
        ),
        Briefing(
            id: UUID(),
            queryId: internQueryID,
            queryText: "Dhaka internships this week",
            importance: .new,
            summary: "New product intern posting at Shajgoj. Remote-friendly, deadline May 10. One listing from last week has been removed.",
            deltaVerdict: "1 new listing, 1 removed",
            sources: .init(domains: ["bdjobs.com", "linkedin.com"]),
            deliveredAt: now.addingTimeInterval(-21600),
            createdAt: now.addingTimeInterval(-21600)
        ),
    ]

    static let stillMonitoring: [StillMonitoringQuery] = [
        StillMonitoringQuery(
            id: buetQueryID,
            rawText: "BUET admission info changes",
            frequency: .daily,
            lastCheckedAt: now.addingTimeInterval(-43200),
            nextCheckAt: now.addingTimeInterval(86400)
        ),
        StillMonitoringQuery(
            id: samsungQueryID,
            rawText: "Samsung launches under ৳50,000",
            frequency: .daily,
            lastCheckedAt: now.addingTimeInterval(-14400),
            nextCheckAt: now.addingTimeInterval(72000)
        ),
        StillMonitoringQuery(
            id: startupQueryID,
            rawText: "Bangladesh startup funding news",
            frequency: .weekly,
            lastCheckedAt: now.addingTimeInterval(-86400 * 3),
            nextCheckAt: nil
        ),
    ]

    static let feed = TodayFeed(
        changes: briefings,
        stillMonitoring: stillMonitoring,
        counts: .init(updatesToday: 2, noChange: 3, running: 5)
    )

    // ── Settings ──

    static let settings = UserSettings(
        id: userID,
        email: "rafid@example.com",
        quietStart: "22:00",
        quietEnd: "07:00",
        digestTime: "08:00",
        defaultThreshold: .balanced,
        defaultDetail: .standard
    )

    // ── AI parse preview (Add Query confirm panel) ──

    static let dollarParse = QueryUnderstanding(
        intent: .trend,
        signalDefinition: "Notify on rate change > 1 BDT or material policy news",
        suggestedSources: ["Bangladesh Bank", "The Daily Star", "Prothom Alo"],
        suggestedFrequency: .daily
    )
}
