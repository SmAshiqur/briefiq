// QuietHoursViewTests.swift
// Placeholder for the iOS-side quiet-hours UI tests once Settings has
// snapshot tests. Lets `BriefIQTests` target compile out of the box.

import XCTest
@testable import BriefIQ

final class QuietHoursViewTests: XCTestCase {
    func test_userSettings_defaultThreshold_isBalanced() {
        let s = MockData.settings
        XCTAssertEqual(s.defaultThreshold, .balanced)
    }
}
