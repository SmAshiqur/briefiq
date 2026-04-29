// AddQueryView.swift
// "Add a query" tab. Two visual states:
//   1. Empty — heading, text input, suggestion chips, "Analyze with AI →"
//   2. Confirming — confirm panel with intent/sources/freq/threshold

import SwiftUI

struct AddQueryView: View {
    @State private var vm = AnalyzeViewModel()
    @Environment(AppRouterState.self) private var router

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    heading

                    inputBox

                    if vm.stage == .confirming || vm.stage == .saving {
                        ConfirmPanelView(vm: vm)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    if vm.stage != .confirming && vm.stage != .saving {
                        suggestionsSection
                        analyzeButton
                    }

                    if case .failed(let reason) = vm.stage {
                        Text(reason)
                            .font(.system(size: 12))
                            .foregroundStyle(BriefIQTheme.red)
                            .padding(.top, 4)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 40)
                .frame(maxWidth: 560, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(BriefIQTheme.bg)
            .navigationTitle("Add query")
            .navigationBarTitleDisplayMode(.inline)
            // After save, jump to the Queries tab so the user sees their
            // new entry in context.
            .onChange(of: vm.stage) { _, new in
                if new == .saved {
                    router.selectedTab = .queries
                    vm.reset()
                }
            }
        }
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 8) {
            (Text("What do you want ")
                .font(.system(size: 28, weight: .regular, design: .serif))
                .foregroundColor(BriefIQTheme.text)
            + Text("to track?")
                .italic()
                .foregroundColor(BriefIQTheme.accent))
                .lineLimit(2)
            Text("Type your question naturally. The AI infers intent, picks sources, and chooses how often to check — only telling you when something actually changes.")
                .font(.system(size: 13.5))
                .foregroundStyle(BriefIQTheme.text2)
                .lineSpacing(2)
        }
    }

    private var inputBox: some View {
        VStack(alignment: .leading, spacing: 0) {
            TextEditor(text: $vm.queryText)
                .font(.system(size: 14.5))
                .scrollContentBackground(.hidden)
                .padding(14)
                .frame(minHeight: 88, alignment: .topLeading)
                .background(BriefIQTheme.surface)
                .overlay(alignment: .topLeading) {
                    // Manual placeholder — TextEditor doesn't have one.
                    if vm.queryText.isEmpty {
                        Text("e.g. Is the dollar rate rising in Bangladesh?")
                            .font(.system(size: 14.5))
                            .foregroundStyle(BriefIQTheme.text3)
                            .padding(.top, 22)
                            .padding(.leading, 18)
                            .allowsHitTesting(false)
                    }
                }
        }
        .clipShape(RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius))
        .overlay(
            RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadius)
                .strokeBorder(BriefIQTheme.border, lineWidth: 1.5)
        )
    }

    private var suggestionsSection: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("SUGGESTIONS")
                .font(.system(size: 10.5, weight: .medium))
                .tracking(0.9)
                .foregroundStyle(BriefIQTheme.text3)

            // Wrapping chip layout. SwiftUI doesn't have a native flow
            // layout, so we use a simple HStack inside a flexible
            // FlowLayout-like wrapper.
            FlowChips(items: vm.suggestions) { suggestion in
                Button {
                    vm.queryText = suggestion
                } label: {
                    Text(suggestion)
                        .font(.system(size: 12))
                        .foregroundStyle(BriefIQTheme.text2)
                        .padding(.horizontal, 13)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(BriefIQTheme.surface))
                        .overlay(Capsule().strokeBorder(BriefIQTheme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var analyzeButton: some View {
        Button {
            Task { await vm.analyze() }
        } label: {
            HStack {
                if vm.stage == .analyzing {
                    ProgressView()
                        .tint(BriefIQTheme.bg)
                } else {
                    Text("Analyze with AI →")
                        .font(.system(size: 13.5, weight: .semibold))
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(BriefIQTheme.accent)
            .foregroundStyle(BriefIQTheme.bg)
            .clipShape(RoundedRectangle(cornerRadius: BriefIQTheme.cornerRadiusSmall))
        }
        .disabled(vm.queryText.trimmingCharacters(in: .whitespaces).count < 4 || vm.stage == .analyzing)
    }
}

#Preview {
    AddQueryView()
        .environment(AppRouterState())
        .preferredColorScheme(.dark)
}
