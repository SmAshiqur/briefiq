// ConfirmPanelView.swift
// The "I'll track this for you" panel that appears after Analyze.
// Shows intent, sources, signal definition, frequency picker, threshold pills.

import SwiftUI

struct ConfirmPanelView: View {
    @Bindable var vm: AnalyzeViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            quotedQuery
            parseGrid
            frequencyPicker
            thresholdRow
            actionButtons
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius)
                .fill(LinearGradient(
                    colors: [BriefIQTheme.accentMuted, BriefIQTheme.surface],
                    startPoint: .top,
                    endPoint: .bottom
                ))
        )
        .overlay(
            RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius)
                .strokeBorder(BriefIQTheme.accent.opacity(0.4), lineWidth: 1)
        )
    }

    // ── Sub-views ──────────────────────────────────────────────────────

    private var header: some View {
        HStack(spacing: 7) {
            Circle().fill(BriefIQTheme.accent).frame(width: 6, height: 6)
            Text("I'LL TRACK THIS FOR YOU")
                .font(.system(size: 10.5, weight: .semibold))
                .tracking(1.0)
                .foregroundStyle(BriefIQTheme.accentBright)
        }
    }

    private var quotedQuery: some View {
        Text("\"\(vm.queryText)\"")
            .font(.system(size: 16, weight: .regular, design: .serif))
            .italic()
            .foregroundStyle(BriefIQTheme.text)
            .lineSpacing(2)
    }

    private var parseGrid: some View {
        VStack(spacing: 12) {
            // Intent + sources side-by-side, signal definition below.
            HStack(alignment: .top, spacing: 12) {
                ParseCell(
                    label: "Intent",
                    value: intentLabel(vm.parse?.intent ?? .other)
                )
                ParseCell(
                    label: "Likely sources",
                    value: vm.parse?.suggestedSources.prefix(3).joined(separator: ", ") ?? "Auto-detect"
                )
            }
            ParseCell(
                label: "Signal definition",
                value: vm.parse?.signalDefinition ?? "Notify on any meaningful change.",
                fullWidth: true
            )
        }
    }

    private var frequencyPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Check frequency")
                    .font(.system(size: 11))
                    .foregroundStyle(BriefIQTheme.text2)
                Spacer()
                Text("AI SUGGESTED")
                    .font(.system(size: 9.5, weight: .semibold))
                    .tracking(0.5)
                    .foregroundStyle(BriefIQTheme.accentBright)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 1)
                    .background(Capsule().fill(Color.black.opacity(0.25)))
                    .overlay(Capsule().strokeBorder(BriefIQTheme.accent.opacity(0.4), lineWidth: 1))
            }
            HStack(spacing: 7) {
                ForEach(Query.Frequency.allCases, id: \.self) { freq in
                    Button {
                        vm.chosenFrequency = freq
                    } label: {
                        Text(freqLabel(freq))
                            .font(.system(size: 11.5))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .foregroundStyle(vm.chosenFrequency == freq ? BriefIQTheme.bg : BriefIQTheme.text2)
                            .background(
                                RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadiusSmall)
                                    .fill(vm.chosenFrequency == freq ? BriefIQTheme.accent : Color.black.opacity(0.20))
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadiusSmall)
                                    .strokeBorder(vm.chosenFrequency == freq ? BriefIQTheme.accent : BriefIQTheme.border2, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var thresholdRow: some View {
        HStack {
            Text("Signal threshold")
                .font(.system(size: 12))
                .foregroundStyle(BriefIQTheme.text2)
            Text("only meaningful changes")
                .font(.system(size: 12, weight: .medium))
                .italic()
                .foregroundStyle(BriefIQTheme.text)
            Spacer()
            HStack(spacing: 4) {
                ForEach(Query.Threshold.allCases, id: \.self) { t in
                    Button {
                        vm.chosenThreshold = t
                    } label: {
                        Text(t.rawValue.capitalized)
                            .font(.system(size: 11))
                            .foregroundStyle(vm.chosenThreshold == t ? BriefIQTheme.bg : BriefIQTheme.text2)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(
                                Capsule().fill(vm.chosenThreshold == t ? BriefIQTheme.accent : Color.clear)
                            )
                            .overlay(
                                Capsule().strokeBorder(vm.chosenThreshold == t ? BriefIQTheme.accent : BriefIQTheme.border2, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadiusSmall)
                .fill(Color.black.opacity(0.15))
        )
        .overlay(
            RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadiusSmall)
                .strokeBorder(BriefIQTheme.border, lineWidth: 1)
        )
    }

    private var actionButtons: some View {
        HStack(spacing: 8) {
            Button {
                Task { await vm.save() }
            } label: {
                HStack {
                    if vm.stage == .saving {
                        ProgressView().tint(BriefIQTheme.bg)
                    } else {
                        Text("Start tracking")
                            .font(.system(size: 13, weight: .semibold))
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 11)
                .background(BriefIQTheme.accent)
                .foregroundStyle(BriefIQTheme.bg)
                .clipShape(RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadiusSmall))
            }
            .buttonStyle(.plain)
            .disabled(vm.stage == .saving)

            Button {
                vm.stage = .editing
            } label: {
                Text("Edit")
                    .font(.system(size: 13))
                    .foregroundStyle(BriefIQTheme.text2)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 11)
                    .background(
                        RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadiusSmall)
                            .strokeBorder(BriefIQTheme.border2, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────

    private func intentLabel(_ intent: Query.IntentType) -> String {
        switch intent {
        case .trend: return "Trend tracking"
        case .event: return "Event monitoring"
        case .policy: return "Policy changes"
        case .listing: return "Listing tracking"
        case .price: return "Price tracking"
        case .other: return "Auto-detected"
        }
    }

    private func freqLabel(_ f: Query.Frequency) -> String {
        switch f {
        case .hourly: return "Every few hours"
        case .daily: return "Daily"
        case .weekly: return "Weekly"
        }
    }
}

private struct ParseCell: View {
    let label: String
    let value: String
    var fullWidth: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.7)
                .foregroundStyle(BriefIQTheme.accentBright.opacity(0.85))
            Text(value)
                .font(.system(size: 12.5))
                .foregroundStyle(BriefIQTheme.text)
                .lineSpacing(2)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadiusSmall)
                .fill(Color.black.opacity(0.20))
        )
        .overlay(
            RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadiusSmall)
                .strokeBorder(BriefIQTheme.accent.opacity(0.4), lineWidth: 1)
        )
        .frame(maxWidth: fullWidth ? .infinity : nil)
    }
}

#Preview {
    ConfirmPanelView(vm: {
        let vm = AnalyzeViewModel()
        vm.queryText = "Track dollar rate in Bangladesh"
        vm.parse = MockData.dollarParse
        vm.chosenFrequency = MockData.dollarParse.suggestedFrequency
        vm.stage = .confirming
        return vm
    }())
    .padding()
    .background(BriefIQTheme.bg)
    .preferredColorScheme(.dark)
}
