// FeedView.swift
// Today's briefing — the home tab.
//
// Visual structure mirrors briefiq-prototype.html exactly:
//   1. Editorial hero line ("2 things changed today.")
//   2. Stat row (updates today / no change / running)
//   3. "What changed" — priority-sorted briefing cards
//   4. "Still monitoring" — reassurance block for queries that returned silence
//   5. Sync footer ("last sync N min ago / next briefing tomorrow at 8am")

import SwiftUI

struct FeedView: View {
    @State private var vm = FeedViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    hero
                    statRow
                    if !vm.feed.changes.isEmpty {
                        changesSection
                    }
                    if !vm.feed.stillMonitoring.isEmpty {
                        stillMonitoringSection
                    }
                    syncFooter
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 40)
            }
            .background(BriefIQTheme.bg)
            .navigationTitle("Today")
            .navigationBarTitleDisplayMode(.inline)
            // Pull to refresh — system gesture.
            .refreshable { await vm.load() }
            // First load when the tab opens.
            .task { await vm.load() }
        }
    }

    // ── Hero (editorial intro line) ─────────────────────────────────────

    private var hero: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(heroTitle)
                .font(.system(size: 28, weight: .regular, design: .serif))
                .foregroundStyle(BriefIQTheme.text)
                .lineSpacing(2)
                // Italicize "today" in the same way the HTML prototype does
                // by composing a Text with an italic span.
            Text(heroSubtitle)
                .font(.system(size: 14))
                .foregroundStyle(BriefIQTheme.text2)
                .lineSpacing(2)
                .frame(maxWidth: 560, alignment: .leading)
        }
        .padding(.bottom, 14)
        .overlay(alignment: .bottom) {
            // Dashed divider under the hero matches the prototype.
            Divider().background(BriefIQTheme.border)
        }
    }

    private var heroTitle: AttributedString {
        let count = vm.feed.counts.updatesToday
        let phrase = count == 0
            ? "Nothing meaningful changed yet."
            : "\(count) thing\(count == 1 ? "" : "s") changed today."
        var s = AttributedString(phrase)
        // Italicize the "today" / yet portion in accent color when present.
        if let range = s.range(of: count == 0 ? "yet" : "today") {
            s[range].font = .system(size: 28, weight: .regular, design: .serif).italic()
            s[range].foregroundColor = BriefIQTheme.accent
        }
        return s
    }

    private var heroSubtitle: String {
        let q = vm.feed.counts.running
        let s = vm.feed.counts.noChange
        if q == 0 {
            return "Add your first query to start tracking what matters."
        }
        if s == 0 {
            return "Everything you're tracking surfaced something today. Tap a card for context and sources."
        }
        return "\(s) more \(s == 1 ? "query is" : "queries are") running quietly in the background — nothing worth interrupting you about. Silence is the system working."
    }

    // ── Stat row ────────────────────────────────────────────────────────

    private var statRow: some View {
        HStack(spacing: 10) {
            StatCard(
                label: "Updates today",
                value: "\(vm.feed.counts.updatesToday)",
                dotColor: BriefIQTheme.accent,
                emphasis: .accent
            )
            StatCard(
                label: "No change",
                value: "\(vm.feed.counts.noChange)",
                dotColor: BriefIQTheme.text3,
                emphasis: .muted
            )
            StatCard(
                label: "Queries running",
                value: "\(vm.feed.counts.running)",
                dotColor: BriefIQTheme.accentBright,
                emphasis: .neutral
            )
        }
    }

    // ── Changes section ────────────────────────────────────────────────

    private var changesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(title: "What changed", count: vm.feed.changes.count)
            ForEach(vm.feed.changes) { briefing in
                NavigationLink {
                    QueryDetailView(queryID: briefing.queryId)
                } label: {
                    BriefingCard(briefing: briefing)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // ── Still monitoring (silence reassurance) ─────────────────────────

    private var stillMonitoringSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Circle().fill(BriefIQTheme.text3).frame(width: 7, height: 7)
                Text("Still monitoring · \(vm.feed.stillMonitoring.count) \(vm.feed.stillMonitoring.count == 1 ? "query" : "queries")")
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(BriefIQTheme.text)
            }
            Text("No meaningful change detected. The system checked these and intentionally chose not to interrupt you.")
                .font(.system(size: 12))
                .foregroundStyle(BriefIQTheme.text3)
                .padding(.bottom, 4)

            ForEach(vm.feed.stillMonitoring) { item in
                StillMonitoringRow(item: item)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius)
                .strokeBorder(BriefIQTheme.border2, style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                .background(
                    RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius)
                        .fill(Color.white.opacity(0.012))
                )
        )
    }

    // ── Sync footer ─────────────────────────────────────────────────────

    private var syncFooter: some View {
        HStack(spacing: 8) {
            Circle().fill(BriefIQTheme.accent).frame(width: 6, height: 6)
            Text(vm.hasLoaded ? "Last sync just now · next briefing tomorrow at 8:00 AM" : "Loading…")
                .font(.system(size: 11.5))
                .foregroundStyle(BriefIQTheme.text3)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }
}

// MARK: - Sub-views

private struct StatCard: View {
    enum Emphasis { case accent, muted, neutral }
    let label: String
    let value: String
    let dotColor: Color
    let emphasis: Emphasis

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Circle().fill(dotColor).frame(width: 6, height: 6)
                Text(label.uppercased())
                    .font(.system(size: 10, weight: .medium))
                    .tracking(0.9)
                    .foregroundStyle(BriefIQTheme.text3)
            }
            Text(value)
                .font(.system(size: 28, weight: .regular, design: .serif))
                .foregroundStyle(valueColor)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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

    private var valueColor: Color {
        switch emphasis {
        case .accent: return BriefIQTheme.accentBright
        case .muted: return BriefIQTheme.text2
        case .neutral: return BriefIQTheme.text
        }
    }
}

private struct SectionLabel: View {
    let title: String
    let count: Int?

    var body: some View {
        HStack(spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 10.5, weight: .medium))
                .tracking(0.9)
                .foregroundStyle(BriefIQTheme.text3)
            if let count {
                Text("\(count)")
                    .font(.system(size: 10))
                    .foregroundStyle(BriefIQTheme.text3)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 1)
                    .background(
                        Capsule().fill(BriefIQTheme.surface2)
                    )
                    .overlay(
                        Capsule().strokeBorder(BriefIQTheme.border, lineWidth: 1)
                    )
            }
        }
    }
}

private struct StillMonitoringRow: View {
    let item: StillMonitoringQuery

    var body: some View {
        HStack(spacing: 9) {
            Circle().fill(BriefIQTheme.text3).frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.rawText)
                    .font(.system(size: 14))
                    .foregroundStyle(BriefIQTheme.text)
                    .opacity(0.7)
                Text(monitoringDetail)
                    .font(.system(size: 11))
                    .foregroundStyle(BriefIQTheme.text3)
            }
            Spacer()
            Text("No change")
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.4)
                .foregroundStyle(BriefIQTheme.text3)
                .padding(.horizontal, 9)
                .padding(.vertical, 3)
                .background(Capsule().fill(BriefIQTheme.surface2))
                .overlay(Capsule().strokeBorder(BriefIQTheme.border, lineWidth: 1))
        }
        .padding(.vertical, 4)
    }

    private var monitoringDetail: String {
        let when: String = {
            guard let last = item.lastCheckedAt else { return "not yet checked" }
            return "Checked \(RelativeDateFormatter.short.localizedString(for: last, relativeTo: Date()))"
        }()
        let next: String = {
            guard let next = item.nextCheckAt else { return "" }
            return " · Next \(RelativeDateFormatter.short.localizedString(for: next, relativeTo: Date()))"
        }()
        return when + next
    }
}

#Preview {
    FeedView()
        .preferredColorScheme(.dark)
}
