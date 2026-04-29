// AnalyzeViewModel.swift
// State machine for the Add Query screen.
//
// Stages (mirrors the prototype's UX):
//   .editing      — user types in the query text
//   .analyzing    — LLM is parsing ("Analyze with AI →" was tapped)
//   .confirming   — show the confirm panel; user can adjust before saving
//   .saving       — POST /queries in flight
//   .saved        — success; we navigate back to the queries tab

import Foundation
import Observation

@MainActor
@Observable
final class AnalyzeViewModel {
    enum Stage: Equatable {
        case editing
        case analyzing
        case confirming
        case saving
        case saved
        case failed(String)
    }

    var queryText: String = ""
    var stage: Stage = .editing

    /// LLM parse result — nil until `analyze()` succeeds.
    var parse: QueryUnderstanding?

    /// Mutable values seeded from `parse`. The user can override before save.
    var chosenFrequency: Query.Frequency = .daily
    var chosenThreshold: Query.Threshold = .balanced

    /// Suggested chips shown above the input field.
    let suggestions: [String] = [
        "Track dollar rate in Bangladesh",
        "Any new scholarships for BD students?",
        "Track import policy changes in Bangladesh",
        "New tech jobs in Dhaka this week",
        "iPhone price changes in Bangladesh",
        "BUET admission updates",
    ]

    /// Tap "Analyze with AI →". Calls /queries/analyze and moves to
    /// .confirming when the LLM responds.
    func analyze() async {
        let trimmed = queryText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 4 else { return }

        stage = .analyzing
        do {
            let result = try await QueriesAPI.analyze(text: trimmed)
            parse = result
            chosenFrequency = result.suggestedFrequency
            chosenThreshold = .balanced
            stage = .confirming
        } catch {
            // Fall back to a sensible default parse so the user can still
            // proceed offline / when the LLM is rate-limited. The prototype
            // values match Mock data.
            parse = QueryUnderstanding(
                intent: .other,
                signalDefinition: "Notify on any meaningful update.",
                suggestedSources: [],
                suggestedFrequency: .daily
            )
            chosenFrequency = .daily
            stage = .confirming
        }
    }

    /// Save the confirmed query. Calls POST /queries.
    func save() async {
        guard let parse else { return }
        stage = .saving

        let body = QueriesAPI.CreateBody(
            rawText: queryText.trimmingCharacters(in: .whitespacesAndNewlines),
            intentType: parse.intent.rawValue,
            frequency: chosenFrequency.rawValue,
            sources: parse.suggestedSources.isEmpty
                ? nil
                : .init(domains: parse.suggestedSources),
            signalThreshold: chosenThreshold.rawValue
        )

        do {
            _ = try await QueriesAPI.create(body)
            stage = .saved
        } catch {
            stage = .failed("Couldn't save: \(error.localizedDescription)")
        }
    }

    /// Reset back to the editing state — used by the "Edit" button on the
    /// confirm panel and after a successful save.
    func reset() {
        queryText = ""
        parse = nil
        stage = .editing
    }
}
