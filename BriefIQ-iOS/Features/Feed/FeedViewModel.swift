// FeedViewModel.swift
// State + actions for Today's briefing feed.
//
// Uses the Observation framework (no Combine, no @StateObject). Keeps state
// minimal: feed payload, loading flag, optional error. The view owns the
// concrete instance via @State; navigation pushes detail views directly.

import Foundation
import Observation

@MainActor
@Observable
final class FeedViewModel {
    /// Starts empty at runtime. Previews inject MockData.feed directly.
    var feed: TodayFeed = .empty

    var isLoading: Bool = false
    var error: APIError?

    /// True when the feed has been successfully refreshed at least once.
    /// Drives the "live" pulse dot in the header.
    var hasLoaded: Bool = false

    /// Pull-to-refresh / view-appear handler. Falls back to mock data on
    /// failure so we still render something useful in the simulator
    /// without a backend.
    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            feed = try await BriefingsAPI.today()
            hasLoaded = true
            error = nil
        } catch let apiError as APIError {
            error = apiError
        } catch {
            self.error = .transport(error)
        }
    }
}
