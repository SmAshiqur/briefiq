// BriefIQTheme.swift
// Centralized color + typography tokens. Mirrors the CSS variables in
// briefiq-prototype.html so the Swift UI matches the dark-mode mockup
// pixel-for-pixel.
//
// Why a single namespace and not Asset Catalog colors:
//   - The palette is small and stable; one file is easier to scan than
//     poking at Assets.xcassets per color.
//   - We can switch to AC colors later without touching call sites if we
//     keep this file's static accessors stable.

import SwiftUI

enum BriefIQTheme {
    // ── Backgrounds ──
    static let bg = Color(red: 0x0E / 255, green: 0x10 / 255, blue: 0x0F / 255)
    static let surface = Color(red: 0x15 / 255, green: 0x18 / 255, blue: 0x1A / 255)
    static let surface2 = Color(red: 0x1B / 255, green: 0x1F / 255, blue: 0x21 / 255)
    static let surface3 = Color(red: 0x21 / 255, green: 0x26 / 255, blue: 0x2A / 255)

    // ── Borders ──
    static let border = Color(red: 0x24 / 255, green: 0x2A / 255, blue: 0x2C / 255)
    static let border2 = Color(red: 0x32 / 255, green: 0x3A / 255, blue: 0x3D / 255)

    // ── Text ──
    static let text = Color(red: 0xEC / 255, green: 0xEA / 255, blue: 0xE5 / 255)
    static let text2 = Color(red: 0xA8 / 255, green: 0xAD / 255, blue: 0xA8 / 255)
    static let text3 = Color(red: 0x6F / 255, green: 0x74 / 255, blue: 0x70 / 255)

    // ── Brand accent (sage green) ──
    static let accent = Color(red: 0x7B / 255, green: 0xB8 / 255, blue: 0x93 / 255)
    static let accentBright = Color(red: 0x9E / 255, green: 0xD6 / 255, blue: 0xB3 / 255)
    static let accentMuted = Color(red: 0x1A / 255, green: 0x29 / 255, blue: 0x22 / 255)

    // ── Signal colors (priority bars) ──
    static let red = Color(red: 0xE0 / 255, green: 0x80 / 255, blue: 0x70 / 255)
    static let amber = Color(red: 0xD9 / 255, green: 0xA9 / 255, blue: 0x68 / 255)

    // ── Shape tokens ──
    static let cornerRadius: CGFloat = 12
    static let cornerRadiusSmall: CGFloat = 8
}

// Convenience: importance -> color, used by feed cards + detail view.
extension BriefIQTheme {
    static func importanceColor(_ importance: Briefing.Importance) -> Color {
        switch importance {
        case .important: return red
        case .new: return accent
        case .minor: return amber
        }
    }
}
