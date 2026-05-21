// Unit tests for MonitoringService.
//
// We pass reportToBackend: false everywhere — these tests run offline and
// shouldn't spawn real /ops/events POSTs.

import XCTest
@testable import BriefIQ

final class MonitoringServiceTests: XCTestCase {
    private let svc = MonitoringService.shared

    override func setUp() async throws {
        await svc.resetForTesting()
    }

    func testRecordErrorUpdatesLastError() async {
        await svc.record(.error, "test failure", reportToBackend: false)
        let last = await svc.lastErrorMessage()
        XCTAssertEqual(last, "test failure")
    }

    func testInfoDoesNotUpdateLastError() async {
        // Info-level events are not surfaced in the Settings diagnostics card.
        await svc.record(.info, "ok", reportToBackend: false)
        let last = await svc.lastErrorMessage()
        XCTAssertNil(last)
    }

    func testRecordAPIErrorTransportSuppressesBackendReport() async {
        // Transport errors should never trigger a backend post (we'd just
        // fail again). We verify the local state still updates correctly.
        let urlErr = URLError(.notConnectedToInternet)
        await svc.recordAPIError(.transport(urlErr), path: "/queries", method: "GET")
        let last = await svc.lastErrorMessage()
        XCTAssertNotNil(last)
        XCTAssertTrue(last?.contains("/queries") ?? false)
    }
}

final class APIConfigTests: XCTestCase {
    override func setUp() {
        UserDefaults.standard.removeObject(forKey: APIConfig.userDefaultsKey)
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: APIConfig.userDefaultsKey)
    }

    func testRuntimeOverrideTakesPrecedence() {
        APIConfig.setOverride("http://192.168.1.42:3000")
        XCTAssertEqual(APIConfig.baseURL.absoluteString, "http://192.168.1.42:3000")
        XCTAssertEqual(APIConfig.resolvedSource, "UserDefaults override")
    }

    func testEmptyOrInvalidOverrideClears() {
        // Pre-load a valid override, then submit garbage. The setter treats
        // unparseable input as a "clear" so a typo doesn't lock the user
        // into a bad URL.
        APIConfig.setOverride("http://10.0.0.5:3000")
        APIConfig.setOverride("   ")
        XCTAssertNil(UserDefaults.standard.string(forKey: APIConfig.userDefaultsKey))
    }

    func testNilResetClearsOverride() {
        APIConfig.setOverride("http://10.0.0.5:3000")
        APIConfig.setOverride(nil)
        XCTAssertNil(UserDefaults.standard.string(forKey: APIConfig.userDefaultsKey))
    }
}
