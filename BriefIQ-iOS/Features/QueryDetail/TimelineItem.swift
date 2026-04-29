// TimelineItem.swift
// One row in the detail-view timeline. Color dot on the left + connecting
// line to the next item, content on the right.

import SwiftUI

struct TimelineItem: View {
    let briefing: Briefing
    let isLast: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 4) {
                Circle()
                    .fill(BriefIQTheme.importanceColor(briefing.importance))
                    .frame(width: 10, height: 10)
                    .padding(.top, 6)
                if !isLast {
                    Rectangle()
                        .fill(BriefIQTheme.border)
                        .frame(width: 1)
                        .frame(maxHeight: .infinity)
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(timestamp)
                    .font(.system(size: 11))
                    .foregroundStyle(BriefIQTheme.text3)
                Text(briefing.summary)
                    .font(.system(size: 13))
                    .foregroundStyle(BriefIQTheme.text)
                    .lineSpacing(2)
                if let domains = briefing.sources?.domains, !domains.isEmpty {
                    Text("via \(domains.first!)")
                        .font(.system(size: 11))
                        .foregroundStyle(BriefIQTheme.accent)
                        .padding(.top, 2)
                }
            }
            .padding(.bottom, 14)
        }
    }

    private var timestamp: String {
        let f = DateFormatter()
        f.dateFormat = "MMM d · h:mm a"
        return f.string(from: briefing.createdAt)
    }
}

