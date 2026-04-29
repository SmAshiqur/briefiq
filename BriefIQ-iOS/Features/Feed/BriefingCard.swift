// BriefingCard.swift
// One row in the "What changed" list. Mirrors the prototype's left-edge
// priority bar (red / amber / green) + title + body + footer (time + sources).

import SwiftUI

struct BriefingCard: View {
    let briefing: Briefing

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            // Left edge priority bar.
            RoundedRectangle(cornerRadius: 1.5)
                .fill(BriefIQTheme.importanceColor(briefing.importance))
                .frame(width: 3)
                .padding(.vertical, 12)

            VStack(alignment: .leading, spacing: 10) {
                // Top row: title + importance badge.
                HStack(spacing: 9) {
                    Circle()
                        .fill(BriefIQTheme.importanceColor(briefing.importance))
                        .frame(width: 8, height: 8)
                    Text(briefing.queryText)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(BriefIQTheme.text)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    importanceBadge
                }

                // Body summary.
                Text(briefing.summary)
                    .font(.system(size: 13))
                    .foregroundStyle(BriefIQTheme.text2)
                    .lineSpacing(3)
                    .multilineTextAlignment(.leading)

                // Footer: time + sources.
                HStack {
                    Text(timeText)
                        .font(.system(size: 11))
                        .foregroundStyle(BriefIQTheme.text3)
                    Spacer()
                    if let sources = briefing.sources, !sources.domains.isEmpty {
                        sourcesText(sources.domains)
                    }
                }
            }
            .padding(16)
        }
        .background(
            RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius)
                .fill(BriefIQTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius)
                .strokeBorder(BriefIQTheme.border, lineWidth: 1)
        )
    }

    private var importanceBadge: some View {
        let label: String = {
            switch briefing.importance {
            case .important: return "Important"
            case .new: return "New"
            case .minor: return "Minor"
            }
        }()
        let tint = BriefIQTheme.importanceColor(briefing.importance)
        return Text(label.uppercased())
            .font(.system(size: 10, weight: .semibold))
            .tracking(0.4)
            .foregroundStyle(tint)
            .padding(.horizontal, 9)
            .padding(.vertical, 3)
            .background(
                Capsule().fill(tint.opacity(0.10))
            )
            .overlay(
                Capsule().strokeBorder(tint.opacity(0.4), lineWidth: 1)
            )
    }

    private var timeText: String {
        RelativeDateFormatter.short.localizedString(for: briefing.createdAt, relativeTo: Date())
    }

    private func sourcesText(_ domains: [String]) -> some View {
        let suffix = domains.prefix(2).joined(separator: ", ")
        return Text("Sources: \(suffix)")
            .font(.system(size: 11))
            .foregroundStyle(BriefIQTheme.text3)
            .lineLimit(1)
    }
}

#Preview {
    BriefingCard(briefing: MockData.briefings[0])
        .padding()
        .background(BriefIQTheme.bg)
        .preferredColorScheme(.dark)
}
