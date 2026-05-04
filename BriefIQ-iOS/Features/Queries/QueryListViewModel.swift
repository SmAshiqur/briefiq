// QueryListViewModel.swift
// State + load/refresh actions for the Queries tab.

import Foundation
import Observation

@MainActor
@Observable
final class QueryListViewModel {
    var queries: [Query] = MockData.queries
    var isLoading: Bool = false
    var error: APIError?
    var searchText: String = ""

    /// Active queries shown first, paused after — same as the dark-mode
    /// prototype's section split.
    var activeFiltered: [Query] {
        filtered.filter { $0.status == .active }
    }
    var pausedFiltered: [Query] {
        filtered.filter { $0.status == .paused }
    }

    private var filtered: [Query] {
        guard !searchText.isEmpty else { return queries }
        return queries.filter {
            $0.rawText.localizedCaseInsensitiveContains(searchText)
        }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            queries = try await QueriesAPI.list()
            error = nil
        } catch {
            if let apiError = error as? APIError {
                self.error = apiError
            } else {
                self.error = .transport(error)
            }
        }
    }
}
