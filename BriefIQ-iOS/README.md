# BriefIQ iOS

SwiftUI client for [BriefIQ](../briefiq-app-idea.md). Read [`AGENTS.md`](../AGENTS.md) at the repo root, then [`briefiq_ios_architecture_exec.plan.md`](../briefiq_ios_architecture_exec.plan.md) for the architecture and reasoning.

## Stack

- **Swift 6** / **SwiftUI** / iOS 17+ minimum
- **Observation framework** (`@Observable`) — no Combine, no `@StateObject`
- **`URLSession` + `async/await`** — no Alamofire
- **Keychain** for the JWT session token
- **xcodegen** to generate the `.xcodeproj` from `project.yml`

## You will need a Mac to run this

iOS apps cannot be built on Windows. If you're on Windows, you can edit Swift files and the prototype HTML, but you need either:

- A Mac with Xcode 15+ installed (recommended), **or**
- A cloud Mac service (MacStadium, MacInCloud, GitHub Actions for CI builds)

## Quick start (on a Mac)

```bash
# 1. Install xcodegen once.
brew install xcodegen

# 2. Generate the project.
cd BriefIQ-iOS
xcodegen generate

# 3. Open in Xcode and select your team for signing.
open BriefIQ.xcodeproj

# 4. Run on the iOS 17 simulator. The app starts pre-populated with mock
#    data so the four screens render even without a backend running.
```

To talk to the local backend, set `BRIEFIQ_API_BASE_URL` in the run scheme:
1. Edit Scheme -> Run -> Arguments -> Environment Variables
2. Add `BRIEFIQ_API_BASE_URL = http://localhost:3000`
3. (Simulator only — for physical device testing, use your dev machine's LAN IP and ensure CORS allows it.)

## Project layout

```
BriefIQ-iOS/
├── project.yml                  xcodegen project definition
├── App/
│   ├── BriefIQApp.swift         @main entry
│   ├── AppRouter.swift          TabView shell (4 tabs)
│   ├── BriefIQTheme.swift       palette tokens (mirrors prototype CSS)
│   ├── Info.plist
│   └── BriefIQ.entitlements     Sign in with Apple + APNs
├── Core/
│   ├── Network/
│   │   ├── APIClient.swift      URLSession-based JSON client (actor)
│   │   └── BriefingsAPI.swift   typed wrappers (Briefings/Queries/Settings/Auth)
│   ├── Auth/
│   │   └── TokenStore.swift     Keychain-backed JWT store
│   ├── Models/                  Codable structs mirroring backend
│   │   ├── Query.swift
│   │   ├── Briefing.swift
│   │   ├── Settings.swift
│   │   ├── Feedback.swift
│   │   └── MockData.swift       sample data for previews + offline-first
│   └── RelativeDateFormatter.swift
├── Features/
│   ├── Feed/                    Today's briefing tab
│   │   ├── FeedView.swift
│   │   ├── FeedViewModel.swift
│   │   └── BriefingCard.swift
│   ├── Queries/                 My queries tab
│   │   ├── QueryListView.swift
│   │   ├── QueryListViewModel.swift
│   │   └── QueryRow.swift
│   ├── AddQuery/                Add tab — AI confirm flow
│   │   ├── AddQueryView.swift
│   │   ├── ConfirmPanelView.swift
│   │   ├── AnalyzeViewModel.swift
│   │   └── FlowChips.swift      wrapping suggestion chips
│   ├── QueryDetail/             pushed from Feed/Queries
│   │   ├── QueryDetailView.swift
│   │   ├── TimelineItem.swift
│   │   └── FeedbackButton.swift
│   └── Settings/                Settings tab
│       ├── SettingsView.swift
│       └── SettingsViewModel.swift
└── Tests/
    ├── FeedViewModelTests.swift
    └── QuietHoursViewTests.swift
```

## What works today (Week 1 skeleton)

- All 4 tabs render with mock data matching the dark-mode HTML prototype
- ViewModels use `@Observable` and `async/await`
- API contract matches the backend's REST surface
- JWT-aware `APIClient` reads from Keychain on every request

## What's stubbed / next

- Sign in with Apple flow (UI lives in `AppRouter` later; today's API takes the dev sign-in JWT)
- APNs registration on launch
- Pull-to-refresh + true loading states
- Live Activity, Widget, App Intents (Week 8 polish)

## Testing without a Mac

If you only have Windows, you can still iterate on the Swift files. Each `View` has a `#Preview` block that Xcode would render, and the `MockData` namespace lets every screen render without network. When you (or someone on the team) opens this on a Mac, the previews will show the dark-mode prototype reproduced inside SwiftUI.
