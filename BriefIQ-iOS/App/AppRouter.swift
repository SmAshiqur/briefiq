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
        // Dev-only: obtain a JWT on first launch so authenticated endpoints
        // work without an Apple Developer account. The backend rejects this
        // call in production (NODE_ENV != development), so it is safe to
        // ship in the binary — it will simply never succeed outside dev.
        .task { await ensureDevToken() }
    }

    private func ensureDevToken() async {
        guard await TokenStore.shared.token() == nil else { return }
        do {
            let response = try await AuthAPI.devSignIn(handle: "dev-user")
            await TokenStore.shared.setToken(response.token)
        } catch {
            // Server unreachable or already in production mode.
            // Views will surface 401s individually — acceptable in dev.
        }
    }
}

#Preview {
    AppRouter()
        .preferredColorScheme(.dark)
}
