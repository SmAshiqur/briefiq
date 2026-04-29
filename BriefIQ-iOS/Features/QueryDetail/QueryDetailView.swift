// QueryDetailView.swift
// Detail screen for a single query. Pushed from FeedView and QueryListView.
//
// Shows:
//   - Title + meta (frequency / next check / signal)
//   - History timeline (snapshots, color-coded by importance)
//   - Sources side card
//   - "Was this useful?" feedback row
//   - Action row: Edit, Pause, Delete

import SwiftUI

struct QueryDetailView: View {
    let queryID: UUID

    // Local state for now. Pulls from MockData when no backend is reachable.
    @State private var query: Query?
    @State private var briefings: [Briefing] = []
    @State private var feedbackSubmitted: Feedback.Rating?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
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
        .task { load() }
    }

    // ── Sections ───────────────────────────────────────────────────────

    private var title: some View {
        Text(query?.rawText ?? "Loading…")
            .font(.system(size: 22, weight: .regular, design: .serif))
            .foregroundStyle(BriefIQTheme.text)
    }

    private var metaRow: some View {
        HStack(spacing: 18) {
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
                Text("No history yet. The first check is on the way.")
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
                if (query?.sources?.domains.isEmpty ?? true) {
                    Text("Auto-detecting credible sources…")
                        .font(.system(size: 12))
                        .foregroundStyle(BriefIQTheme.text3)
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius)
                .fill(BriefIQTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius)
                .strokeBorder(BriefIQTheme.border, lineWidth: 1)
        )
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
        .background(
            RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius)
                .fill(BriefIQTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius)
                .strokeBorder(BriefIQTheme.border, lineWidth: 1)
        )
    }

    private var actionRow: some View {
        HStack(spacing: 8) {
            actionButton("Edit query", danger: false) {}
            actionButton(query?.status == .paused ? "Resume" : "Pause", danger: false) {}
            actionButton("Delete", danger: true) {}
        }
    }

    private func actionButton(_ title: String, danger: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12.5))
                .foregroundStyle(danger ? BriefIQTheme.red : BriefIQTheme.text2)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadiusSmall)
                        .fill(BriefIQTheme.surface)
                )
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
        case .daily: return "Daily"
        case .weekly: return "Weekly"
        case nil: return "—"
        }
    }

    private var nextCheckLabel: String {
        guard let next = query?.nextCheckAt else { return "—" }
        return RelativeDateFormatter.short.localizedString(for: next, relativeTo: Date())
    }

    private var thresholdLabel: String {
        (query?.signalThreshold ?? .balanced).rawValue.capitalized
    }

    private func load() {
        // For now: source mock data so the screen always renders cleanly.
        // Replace with: try await QueriesAPI.list().first(where: { $0.id == queryID })
        query = MockData.queries.first(where: { $0.id == queryID }) ?? MockData.queries[0]
        briefings = MockData.briefings.filter { $0.queryId == queryID }
    }

    private func submitFeedback(_ rating: Feedback.Rating) async {
        feedbackSubmitted = rating
        // Best-effort fire and forget. The button state already changed
        // optimistically; if the network fails we accept the lie for UX.
        if let firstBriefingID = briefings.first?.id {
            _ = try? await BriefingsAPI.feedback(briefingID: firstBriefingID, rating: rating)
        }
    }
}

#Preview {
    NavigationStack {
        QueryDetailView(queryID: MockData.dollarQueryID)
            .preferredColorScheme(.dark)
    }
}
