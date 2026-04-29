// FeedViewModelTests.swift
// Smoke test that exercises the ViewModel layer without touching the
// network. Verifies our state-machine and that mock data renders correctly.

import XCTest
@testable import BriefIQ

@MainActor
final class FeedViewModelTests: XCTestCase {
    func test_initialState_usesMockData() {
        let vm = FeedViewModel()
        XCTAssertEqual(vm.feed.changes.count, 2)
        XCTAssertEqual(vm.feed.stillMonitoring.count, 3)
        XCTAssertFalse(vm.hasLoaded)
    }

    func test_briefingCard_importanceColor_matchesPriority() {
        // Sanity check that our importance->color mapping covers all cases.
        let red = BriefIQTheme.importanceColor(.important)
        let green = BriefIQTheme.importanceColor(.new)
        let amber = BriefIQTheme.importanceColor(.minor)
        XCTAssertNotEqual(red, green)
        XCTAssertNotEqual(green, amber)
        XCTAssertNotEqual(red, amber)
    }
}

@MainActor
final class AnalyzeViewModelTests: XCTestCase {
    func test_analyze_withTooShortText_doesNothing() async {
        let vm = AnalyzeViewModel()
        vm.queryText = "abc"
        await vm.analyze()
        XCTAssertEqual(vm.stage, .editing)
        XCTAssertNil(vm.parse)
    }

    func test_reset_clearsState() {
        let vm = AnalyzeViewModel()
        vm.queryText = "Track dollar rate in Bangladesh"
        vm.parse = MockData.dollarParse
        vm.stage = .confirming
        vm.reset()
        XCTAssertEqual(vm.queryText, "")
        XCTAssertNil(vm.parse)
        XCTAssertEqual(vm.stage, .editing)
    }
}
