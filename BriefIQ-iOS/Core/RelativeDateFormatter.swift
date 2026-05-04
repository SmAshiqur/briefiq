// RelativeDateFormatter.swift
// Shared, locale-aware "2h ago" / "in 4h" formatter. Used by feed cards,
// query rows, and the sync footer.

import Foundation

enum RelativeDateFormatter {
    static var short: RelativeDateTimeFormatter {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .short
        f.dateTimeStyle = .numeric
        return f
    }
}
