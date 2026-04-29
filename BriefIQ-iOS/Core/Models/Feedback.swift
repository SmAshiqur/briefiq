// Feedback.swift
// Mirrors POST /briefings/:id/feedback.

import Foundation

struct Feedback: Codable, Hashable {
    let id: UUID
    let briefingId: UUID
    let userId: UUID
    let rating: Rating
    let createdAt: Date

    enum Rating: String, Codable, CaseIterable {
        case useful
        case noise
    }
}
