// QueryRow.swift
// A single row in the queries list. Shows the query text, frequency,
// last-checked time, and a green "next check" indicator that mirrors
// the prototype.

import SwiftUI

struct QueryRow: View {
    let query: Query

    var body: some View {
        HStack(spacing: 14) {
            // Icon "tile" — accent-colored for active, greyscale for paused.
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(query.status == .active ? BriefIQTheme.accentMuted : BriefIQTheme.surface3)
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(query.status == .active ? BriefIQTheme.accent.opacity(0.4) : BriefIQTheme.border, lineWidth: 1)
                Text(intentEmoji(for: query.intentType))
                    .font(.system(size: 16))
                    .opacity(query.status == .active ? 1.0 : 0.55)
            }
            .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: 4) {
                Text(query.rawText)
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(BriefIQTheme.text)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Text(frequencyLabel)
                        .font(.system(size: 11.5))
                        .foregroundStyle(BriefIQTheme.text3)
                    if let lastChecked = query.lastCheckedAt {
                        bullet
                        Text("Last checked \(RelativeDateFormatter.short.localizedString(for: lastChecked, relativeTo: Date()))")
                            .font(.system(size: 11.5))
                            .foregroundStyle(BriefIQTheme.text3)
                            .lineLimit(1)
                    }
                    if let next = query.nextCheckAt, query.status == .active {
                        bullet
                        Text("Next \(RelativeDateFormatter.short.localizedString(for: next, relativeTo: Date()))")
                            .font(.system(size: 11.5))
                            .foregroundStyle(BriefIQTheme.accent)
                            .lineLimit(1)
                    }
                }
            }

            Spacer()

            statusBadge
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius)
                .fill(BriefIQTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius)
                .strokeBorder(BriefIQTheme.border, lineWidth: 1)
        )
    }

    private var statusBadge: some View {
        let isActive = query.status == .active
        return Text(isActive ? "Active" : "Paused".uppercased())
            .font(.system(size: 10, weight: .semibold))
            .tracking(0.4)
            .foregroundStyle(isActive ? BriefIQTheme.accentBright : BriefIQTheme.text3)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(
                Capsule().fill(isActive ? BriefIQTheme.accentMuted : BriefIQTheme.surface3)
            )
            .overlay(
                Capsule().strokeBorder(isActive ? BriefIQTheme.accent.opacity(0.4) : BriefIQTheme.border, lineWidth: 1)
            )
    }

    private var bullet: some View {
        Text("·")
            .font(.system(size: 11.5))
            .foregroundStyle(BriefIQTheme.text3)
            .opacity(0.5)
    }

    private var frequencyLabel: String {
        switch query.frequency {
        case .hourly: return "Every few hours"
        case .daily: return "Daily"
        case .weekly: return "Weekly"
        }
    }

    /// Pick a simple emoji that hints at the intent. The prototype uses
    /// these as visual landmarks; not load-bearing, just nice.
    private func intentEmoji(for intent: Query.IntentType) -> String {
        switch intent {
        case .price: return "💱"
        case .listing: return "💼"
        case .event: return "🎓"
        case .policy: return "📜"
        case .trend: return "📈"
        case .other: return "🔍"
        }
    }
}

#Preview {
    VStack(spacing: 8) {
        ForEach(MockData.queries) { q in
            QueryRow(query: q)
        }
    }
    .padding()
    .background(BriefIQTheme.bg)
    .preferredColorScheme(.dark)
}
