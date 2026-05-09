// QueryDetailView.swift
// Detail screen for a single query. Pushed from FeedView and QueryListView.
//
// Shows:
//   - Title + meta (frequency / next check / signal)
//   - History timeline (briefings, color-coded by importance)
//   - Sources side card
//   - "Was this useful?" feedback row
//   - Action row: Pause/Resume, Delete

import SwiftUI

struct QueryDetailView: View {
    let queryID: UUID
    @Environment(\.dismiss) private var dismiss

    @State private var query: Query?
    @State private var briefings: [Briefing] = []
    @State private var feedbackSubmitted: Feedback.Rating?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showDeleteConfirm = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if let error = errorMessage {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(BriefIQTheme.red)
                        .padding(.vertical, 8)
                }

                title
                metaRow
                Divider().background(BriefIQTheme.border)

                VStack(alignment: .leading, spacing: 14) {
                    sectionLabel("History")
                    timeline
                }

                sourcesCard
                feedbackCard
                actionRow
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 40)
        }
        .background(BriefIQTheme.bg)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task {
            await load()
            // Poll every 10s while awaiting the first briefing (worker may still
            // be running). Stops automatically once history arrives or after 5min.
            var ticks = 0
            while !Task.isCancelled && briefings.isEmpty && ticks < 30 {
                try? await Task.sleep(for: .seconds(10))
                await load()
                ticks += 1
            }
        }
        .alert("Delete query?", isPresented: $showDeleteConfirm) {
            Button("Delete", role: .destructive) { Task { await deleteQuery() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Removes this query and all its history. Cannot be undone.")
        }
    }

    // ── Sections ───────────────────────────────────────────────────────

    private var title: some View {
        Text(query?.rawText ?? "Loading…")
            .font(.system(size: 22, weight: .regular, design: .serif))
            .foregroundStyle(BriefIQTheme.text)
    }

    private var metaRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            metaItem(icon: "arrow.triangle.2.circlepath", label: "Frequency", value: frequencyLabel)
            metaItem(icon: "clock", label: "Next check", value: nextCheckLabel)
            metaItem(icon: "circle.dotted", label: "Signal", value: thresholdLabel)
        }
    }

    private func metaItem(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 11))
                .foregroundStyle(BriefIQTheme.text3)
            Text("\(label): ")
                .font(.system(size: 11.5))
                .foregroundStyle(BriefIQTheme.text3)
            Text(value)
                .font(.system(size: 11.5, weight: .medium))
                .foregroundStyle(BriefIQTheme.text)
        }
    }

    private var timeline: some View {
        VStack(spacing: 0) {
            ForEach(Array(briefings.enumerated()), id: \.element.id) { idx, b in
                TimelineItem(briefing: b, isLast: idx == briefings.count - 1)
            }
            if briefings.isEmpty {
                Text(isLoading
                     ? "Loading history…"
                     : "No history yet. The first check is on the way.")
                    .font(.system(size: 13))
                    .foregroundStyle(BriefIQTheme.text3)
                    .padding(.vertical, 14)
            }
        }
    }

    private var sourcesCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("Sources")
            VStack(alignment: .leading, spacing: 8) {
                ForEach(query?.sources?.domains ?? [], id: \.self) { domain in
                    HStack(spacing: 8) {
                        Circle().fill(BriefIQTheme.accent).frame(width: 6, height: 6)
                        Text(domain)
                            .font(.system(size: 12.5))
                            .foregroundStyle(BriefIQTheme.text2)
                    }
                }
                if query?.sources?.domains.isEmpty ?? true {
                    Text("Auto-detecting credible sources…")
                        .font(.system(size: 12))
                        .foregroundStyle(BriefIQTheme.text3)
                }
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius).fill(BriefIQTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius).strokeBorder(BriefIQTheme.border, lineWidth: 1))
    }

    private var feedbackCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionLabel("Was this useful?")
            HStack(spacing: 8) {
                FeedbackButton(rating: .useful, current: feedbackSubmitted) {
                    Task { await submitFeedback(.useful) }
                }
                FeedbackButton(rating: .noise, current: feedbackSubmitted) {
                    Task { await submitFeedback(.noise) }
                }
            }
            Text("Your feedback tunes the signal threshold — fewer false alarms over time.")
                .font(.system(size: 11))
                .foregroundStyle(BriefIQTheme.text3)
                .lineSpacing(2)
                .padding(.top, 4)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius).fill(BriefIQTheme.surface))
        .overlay(RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius).strokeBorder(BriefIQTheme.border, lineWidth: 1))
    }

    private var actionRow: some View {
        HStack(spacing: 8) {
            actionButton(
                query?.status == .paused ? "Resume" : "Pause",
                danger: false
            ) { Task { await togglePause() } }

            actionButton("Delete", danger: true) {
                showDeleteConfirm = true
            }
        }
    }

    private func actionButton(_ title: String, danger: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12.5))
                .foregroundStyle(danger ? BriefIQTheme.red : BriefIQTheme.text2)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadiusSmall).fill(BriefIQTheme.surface))
                .overlay(
                    RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadiusSmall)
                        .strokeBorder(danger ? BriefIQTheme.red.opacity(0.5) : BriefIQTheme.border, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    // ── Helpers ────────────────────────────────────────────────────────

    private func sectionLabel(_ s: String) -> some View {
        Text(s.uppercased())
            .font(.system(size: 10.5, weight: .medium))
            .tracking(0.9)
            .foregroundStyle(BriefIQTheme.text3)
    }

    private var frequencyLabel: String {
        switch query?.frequency {
        case .hourly: return "Every few hours"
        case .daily:  return "Daily"
        case .weekly: return "Weekly"
        case nil:     return "—"
        }
    }

    private var nextCheckLabel: String {
        guard let next = query?.nextCheckAt else { return "—" }
        return RelativeDateFormatter.short.localizedString(for: next, relativeTo: Date())
    }

    private var thresholdLabel: String {
        (query?.signalThreshold ?? .balanced).rawValue.capitalized
    }

    // ── Data + actions ─────────────────────────────────────────────────

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let q = QueriesAPI.getOne(queryID)
            async let b = BriefingsAPI.forQuery(queryID)
            let (fetchedQuery, fetchedBriefings) = try await (q, b)
            query = fetchedQuery
            briefings = fetchedBriefings
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func togglePause() async {
        guard let current = query else { return }
        let newStatus = current.status == .paused ? "active" : "paused"
        if let updated = try? await QueriesAPI.update(queryID, QueriesAPI.UpdateBody(status: newStatus)) {
            query = updated
        }
    }

    private func deleteQuery() async {
        try? await QueriesAPI.delete(queryID)
        dismiss()
    }

    private func submitFeedback(_ rating: Feedback.Rating) async {
        feedbackSubmitted = rating
        if let firstBriefingID = briefings.first?.id {
            _ = try? await BriefingsAPI.feedback(briefingID: firstBriefingID, rating: rating)
        }
    }
}

#Preview {
    NavigationStack {
        QueryDetailView(queryID: UUID())
            .preferredColorScheme(.dark)
    }
}
