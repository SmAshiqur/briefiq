// Settings.swift
// Mirrors GET /settings + PATCH /settings.

import Foundation

struct UserSettings: Codable, Hashable {
    let id: UUID
    let email: String?
    var quietStart: String           // "HH:MM"
    var quietEnd: String             // "HH:MM"
    var digestTime: String           // "HH:MM"
    var defaultThreshold: Query.Threshold
    var defaultDetail: DetailLevel

    enum DetailLevel: String, Codable, CaseIterable {
        case headline, standard, detailed
    }
}

struct UpdateSettingsBody: Codable {
    var quietStart: String?
    var quietEnd: String?
    var digestTime: String?
    var defaultThreshold: Query.Threshold?
    var defaultDetail: UserSettings.DetailLevel?
}
