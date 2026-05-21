import XCTest
@testable import BriefIQ

final class MonitoringServiceTests: XCTestCase {
    func testRecordErrorUpdatesLastErrorMessage() async {
        let svc = MonitoringService.shared
        await svc.record(.error, "test failure", reportToBackend: false)
        let last = await svc.lastErrorMessage()
        XCTAssertEqual(last, "test failure")
    }
}
