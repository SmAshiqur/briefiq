// AppRouter.swift
// Top-level TabView shell. Four tabs match the iOS prototype:
//   - Today's briefing  (Feed)
//   - My queries        (Queries)
//   - Add query         (Add)
//   - Settings
//
// We keep navigation state (which tab) inside `AppRouterState` so any
// deep-link or App Intent can route by writing to its `selectedTab`. The
// state is exposed to descendant views via `.environment(...)`.

import SwiftUI
import Observation

@Observable
final class AppRouterState {
    enum Tab: Hashable {
        case feed
        case queries
        case add
        case settings
    }

    var selectedTab: Tab = .feed
}

struct AppRouter: View {
    // Source of truth for tab selection. Adding a new tab? Add a Tab case,
    // a TabItem in the body, and the matching feature folder.
    @State private var state = AppRouterState()

    var body: some View {
        TabView(selection: $state.selectedTab) {
            FeedView()
                .tabItem {
                    Label("Today", systemImage: "rays")
                }
                .tag(AppRouterState.Tab.feed)

            QueryListView()
                .tabItem {
                    Label("Queries", systemImage: "rectangle.grid.2x2")
                }
                .tag(AppRouterState.Tab.queries)

            AddQueryView()
                .tabItem {
                    Label("Add", systemImage: "plus.circle")
                }
                .tag(AppRouterState.Tab.add)

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape")
                }
                .tag(AppRouterState.Tab.settings)
        }
        // Sage-green accent matches the dark-mode prototype.
        .tint(BriefIQTheme.accent)
        .environment(state)
        // Warm auth on launch so the first tab load doesn't race a 401.
        .task {
            try? await AuthSession.shared.ensureToken()
        }
    }
}

#Preview {
    AppRouter()
        .preferredColorScheme(.dark)
}
