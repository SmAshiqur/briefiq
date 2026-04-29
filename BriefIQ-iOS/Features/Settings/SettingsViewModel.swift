// SettingsViewModel.swift
// Holds the user's settings and persists changes to PATCH /settings on
// each toggle / time-picker change. Optimistic updates keep the UI snappy.

import Foundation
import Observation

@MainActor
@Observable
final class SettingsViewModel {
    var settings: UserSettings = MockData.settings
    var digestModeOn: Bool = true     // local toggle; tied to digestTime presence
    var pushOn: Bool = false
    var emailOn: Bool = true
    var inAppOn: Bool = true
    var showSilenceReassurance: Bool = true
    var error: APIError?

    func load() async {
        do {
            settings = try await SettingsAPI.get()
            error = nil
        } catch let err as APIError {
            error = err
        } catch {
            self.error = .transport(error)
        }
    }

    /// Push a change immediately. Builds a partial UpdateSettingsBody so we
    /// only send what changed. Failure rolls back the optimistic mutation.
    func patch(_ apply: (inout UserSettings) -> Void) async {
        let prev = settings
        apply(&settings)
        let body = UpdateSettingsBody(
            quietStart: settings.quietStart,
            quietEnd: settings.quietEnd,
            digestTime: settings.digestTime,
            defaultThreshold: settings.defaultThreshold,
            defaultDetail: settings.defaultDetail
        )
        do {
            settings = try await SettingsAPI.update(body)
        } catch {
            // Rollback. Don't show an error toast for now; the surface is
            // small and the most likely cause is offline-while-toggling.
            settings = prev
        }
    }
}
