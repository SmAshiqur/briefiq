// FeedbackButton.swift
// "Useful" / "Noise" buttons on the detail screen. Internal so the parent
// view can compose them; disables both after a rating is submitted to
// signal that we received the input.

import SwiftUI

struct FeedbackButton: View {
    let rating: Feedback.Rating
    let current: Feedback.Rating?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(isSelected ? BriefIQTheme.accentBright : BriefIQTheme.text2)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background(
                    RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadiusSmall)
                        .fill(isSelected ? BriefIQTheme.accentMuted : BriefIQTheme.surface2)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadiusSmall)
                        .strokeBorder(isSelected ? BriefIQTheme.accent.opacity(0.5) : BriefIQTheme.border, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .disabled(current != nil)
    }

    private var isSelected: Bool { current == rating }

    private var label: String {
        switch rating {
        case .useful: return "👍 Useful"
        case .noise: return "👎 Noise"
        }
    }
}
