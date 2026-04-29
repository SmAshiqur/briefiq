// BriefIQApp.swift
// Main entry point. SwiftUI App protocol — one window scene that hosts
// our root router.
//
// Kept intentionally tiny. All decisions about which screen to show live
// in AppRouter so this file rarely changes.

import SwiftUI

@main
struct BriefIQApp: App {
    var body: some Scene {
        WindowGroup {
            AppRouter()
                // Force dark mode for now — the prototype is dark-mode-first
                // and matching the spec keeps screenshots consistent. Toggle
                // back to .automatic when the light palette lands.
                .preferredColorScheme(.dark)
        }
    }
}
