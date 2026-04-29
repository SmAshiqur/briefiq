// SettingsView.swift
// Settings tab. Three card groups matching the dark-mode prototype:
//   - Briefing (digest mode, digest time, detail level)
//   - Signal & noise (default threshold, quiet hours, silence reassurance)
//   - Delivery (in-app, email, push)
//
// We use stock SwiftUI controls — Toggle, DatePicker, Picker — with custom
// surface colors so we don't reinvent inputs while still matching the
// prototype palette.

import SwiftUI

struct SettingsView: View {
    @State private var vm = SettingsViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    intro
                    sectionLabel("Briefing")
                    briefingCard
                    sectionLabel("Signal & noise")
                    signalCard
                    sectionLabel("Delivery")
                    deliveryCard
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 40)
            }
            .background(BriefIQTheme.bg)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .task { await vm.load() }
        }
    }

    // ── Intro ─────────────────────────────────────────────────────────

    private var intro: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Settings")
                .font(.system(size: 22, weight: .regular, design: .serif))
                .foregroundStyle(BriefIQTheme.text)
            Text("BriefIQ is built for attention respect. Tune how the system speaks to you.")
                .font(.system(size: 13))
                .foregroundStyle(BriefIQTheme.text2)
                .lineSpacing(2)
        }
        .padding(.bottom, 6)
    }

    // ── Cards ─────────────────────────────────────────────────────────

    private var briefingCard: some View {
        cardContainer {
            VStack(spacing: 14) {
                row(
                    title: "Daily digest mode",
                    subtitle: "Bundle all updates into one morning briefing instead of real-time alerts."
                ) {
                    Toggle("", isOn: $vm.digestModeOn)
                        .labelsHidden()
                        .tint(BriefIQTheme.accent)
                }
                divider
                row(
                    title: "Digest delivery time",
                    subtitle: "When the morning briefing lands."
                ) {
                    timePicker(
                        time: vm.settings.digestTime,
                        onChange: { newValue in
                            Task { await vm.patch { $0.digestTime = newValue } }
                        }
                    )
                }
                divider
                row(
                    title: "Default detail level",
                    subtitle: "How deep updates should go by default."
                ) {
                    Picker("", selection: Binding(
                        get: { vm.settings.defaultDetail },
                        set: { newValue in
                            Task { await vm.patch { $0.defaultDetail = newValue } }
                        }
                    )) {
                        ForEach(UserSettings.DetailLevel.allCases, id: \.self) { d in
                            Text(d.rawValue.capitalized).tag(d)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(BriefIQTheme.accent)
                }
            }
        }
    }

    private var signalCard: some View {
        cardContainer {
            VStack(spacing: 14) {
                row(
                    title: "Default signal threshold",
                    subtitle: "How sensitive the AI is when deciding what counts as meaningful."
                ) {
                    Picker("", selection: Binding(
                        get: { vm.settings.defaultThreshold },
                        set: { newValue in
                            Task { await vm.patch { $0.defaultThreshold = newValue } }
                        }
                    )) {
                        ForEach(Query.Threshold.allCases, id: \.self) { t in
                            Text(t.rawValue.capitalized).tag(t)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(BriefIQTheme.accent)
                }
                divider
                row(
                    title: "Quiet hours",
                    subtitle: "No notifications between these hours."
                ) {
                    HStack(spacing: 6) {
                        timePicker(
                            time: vm.settings.quietStart,
                            onChange: { newValue in
                                Task { await vm.patch { $0.quietStart = newValue } }
                            }
                        )
                        Text("to")
                            .font(.system(size: 12))
                            .foregroundStyle(BriefIQTheme.text3)
                        timePicker(
                            time: vm.settings.quietEnd,
                            onChange: { newValue in
                                Task { await vm.patch { $0.quietEnd = newValue } }
                            }
                        )
                    }
                }
                divider
                row(
                    title: "Show silence reassurance",
                    subtitle: "Include \"still monitoring\" cards so silence doesn't feel like a bug."
                ) {
                    Toggle("", isOn: $vm.showSilenceReassurance)
                        .labelsHidden()
                        .tint(BriefIQTheme.accent)
                }
            }
        }
    }

    private var deliveryCard: some View {
        cardContainer {
            VStack(spacing: 14) {
                row(
                    title: "In-app",
                    subtitle: "Updates land here in your briefing feed."
                ) {
                    Toggle("", isOn: $vm.inAppOn)
                        .labelsHidden()
                        .tint(BriefIQTheme.accent)
                }
                divider
                row(
                    title: "Email",
                    subtitle: vm.settings.email ?? "Not connected"
                ) {
                    Toggle("", isOn: $vm.emailOn)
                        .labelsHidden()
                        .tint(BriefIQTheme.accent)
                }
                divider
                row(
                    title: "Push notifications",
                    subtitle: "Only triggers for high-priority signals."
                ) {
                    Toggle("", isOn: $vm.pushOn)
                        .labelsHidden()
                        .tint(BriefIQTheme.accent)
                }
            }
        }
    }

    // ── Reusable bits ─────────────────────────────────────────────────

    private func cardContainer<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius)
                    .fill(BriefIQTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius)
                    .strokeBorder(BriefIQTheme.border, lineWidth: 1)
            )
    }

    private var divider: some View {
        Rectangle()
            .fill(BriefIQTheme.border)
            .frame(height: 1)
    }

    private func row<Trailing: View>(
        title: String,
        subtitle: String,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(BriefIQTheme.text)
                Text(subtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(BriefIQTheme.text3)
                    .lineSpacing(2)
            }
            Spacer()
            trailing()
        }
    }

    /// HH:MM string -> DatePicker -> back to HH:MM. Time-only style.
    private func timePicker(
        time: String,
        onChange: @escaping (String) -> Void
    ) -> some View {
        let date = parseHHMM(time)
        return DatePicker(
            "",
            selection: Binding(
                get: { date },
                set: { onChange(formatHHMM($0)) }
            ),
            displayedComponents: .hourAndMinute
        )
        .labelsHidden()
        .datePickerStyle(.compact)
    }

    private func sectionLabel(_ s: String) -> some View {
        Text(s.uppercased())
            .font(.system(size: 10.5, weight: .medium))
            .tracking(0.9)
            .foregroundStyle(BriefIQTheme.text3)
            .padding(.top, 8)
    }

    // MARK: HH:MM <-> Date

    private func parseHHMM(_ s: String) -> Date {
        let parts = s.split(separator: ":").compactMap { Int($0) }
        var c = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        c.hour = parts.first ?? 8
        c.minute = parts.count > 1 ? parts[1] : 0
        return Calendar.current.date(from: c) ?? Date()
    }

    private func formatHHMM(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f.string(from: d)
    }
}

#Preview {
    SettingsView()
        .preferredColorScheme(.dark)
}
