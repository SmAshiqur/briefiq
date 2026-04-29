---
name: add-ios-feature
description: Add a new SwiftUI feature to the BriefIQ-iOS app following the Features/<Name>/ pattern with View, ViewModel, and tests. Use when adding a new screen, tab, or self-contained UI flow (e.g., a new settings page, a new briefing card variant, an onboarding flow).
---

# Add an iOS Feature

## When to use

You are adding a self-contained screen or flow: a new tab, a settings sub-page, a briefing detail variant, an onboarding step.

## Workflow

```
- [ ] 1. Create Features/<Name>/ folder
- [ ] 2. Add <Name>ViewModel.swift (@Observable state + actions)
- [ ] 3. Add <Name>View.swift (the SwiftUI view)
- [ ] 4. Wire into AppRouter or parent view
- [ ] 5. Reuse APIClient for networking
- [ ] 6. Write a ViewModel test
```

## Step 1: Folder

```
BriefIQ-iOS/
└── Features/
    └── Feedback/
        ├── FeedbackView.swift
        ├── FeedbackViewModel.swift
        └── FeedbackButtonRow.swift     // optional sub-views colocated
```

## Step 2: ViewModel

Use the Observation framework — no `Combine`, no `@StateObject`.

```swift
import Foundation
import Observation

@Observable
final class FeedbackViewModel {
    var isLoading = false
    var error: Error?
    var didSubmit = false

    private let api: APIClient
    private let briefingID: UUID

    init(briefingID: UUID, api: APIClient = .shared) {
        self.briefingID = briefingID
        self.api = api
    }

    func submit(rating: Feedback.Rating) async {
        isLoading = true
        defer { isLoading = false }
        do {
            _ = try await api.post(
                "/briefings/\(briefingID)/feedback",
                body: ["rating": rating.rawValue]
            )
            didSubmit = true
        } catch {
            self.error = error
        }
    }
}
```

## Step 3: View

```swift
struct FeedbackView: View {
    @State private var vm: FeedbackViewModel

    init(briefingID: UUID) {
        _vm = State(initialValue: FeedbackViewModel(briefingID: briefingID))
    }

    var body: some View {
        HStack(spacing: 12) {
            Button("Useful") { Task { await vm.submit(rating: .useful) } }
            Button("Noise")  { Task { await vm.submit(rating: .noise) } }
        }
        .disabled(vm.isLoading || vm.didSubmit)
        .overlay { if vm.isLoading { ProgressView() } }
    }
}
```

## Step 4: Wire up

For a tab, add to `App/AppRouter.swift`:

```swift
.tabItem { Label("Feedback", systemImage: "hand.thumbsup") }
```

For a sub-screen, push from a parent view's `NavigationLink`.

## Step 5: API integration

Networking goes through `Core/Network/APIClient.swift`. Don't call `URLSession` directly from a ViewModel.

## Step 6: Test

```swift
import XCTest
@testable import BriefIQ

@MainActor
final class FeedbackViewModelTests: XCTestCase {
    func test_submit_setsDidSubmitOnSuccess() async {
        let vm = FeedbackViewModel(
            briefingID: UUID(),
            api: .mocked(returning: EmptyResponse())
        )
        await vm.submit(rating: .useful)
        XCTAssertTrue(vm.didSubmit)
        XCTAssertNil(vm.error)
    }
}
```

## Anti-patterns

- Putting state inside the View instead of an `@Observable` ViewModel.
- Using `@StateObject` / `@ObservableObject`. Use `@Observable` + `@State`.
- Calling `URLSession` directly. Always go through `APIClient`.
- Completion-handler async code. Use `async/await`.
- Adding a third-party SwiftUI library without explicit approval.
