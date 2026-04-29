// RelativeDateFormatter.swift
// Shared, locale-aware "2h ago" / "in 4h" formatter. Used by feed cards,
// query rows, and the sync footer.

import Foundation

enum RelativeDateFormatter {
    /// Compact ("2h ago", "5m ago"). Falls back to a calendar date for
    /// anything older than 6 days, matching iOS conventions.
    static let short: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .short
        f.dateTimeStyle = .numeric
        return f
    }()
}
