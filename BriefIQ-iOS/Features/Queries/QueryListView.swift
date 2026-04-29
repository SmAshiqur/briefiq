// QueryListView.swift
// "My queries" tab. Lists active and paused tracking queries with
// next-check timing and quick navigation to detail.

import SwiftUI

struct QueryListView: View {
    @State private var vm = QueryListViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if !vm.activeFiltered.isEmpty {
                        section(title: "Active", queries: vm.activeFiltered)
                    }
                    if !vm.pausedFiltered.isEmpty {
                        section(title: "Paused", queries: vm.pausedFiltered)
                    }
                    if vm.activeFiltered.isEmpty && vm.pausedFiltered.isEmpty {
                        emptyState
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 40)
            }
            .background(BriefIQTheme.bg)
            .navigationTitle("Queries")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $vm.searchText, prompt: "Search your queries")
            .refreshable { await vm.load() }
            .task { await vm.load() }
        }
    }

    private func section(title: String, queries: [Query]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(title.uppercased())
                    .font(.system(size: 10.5, weight: .medium))
                    .tracking(0.9)
                    .foregroundStyle(BriefIQTheme.text3)
                Text("\(queries.count)")
                    .font(.system(size: 10))
                    .foregroundStyle(BriefIQTheme.text3)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 1)
                    .background(Capsule().fill(BriefIQTheme.surface2))
                    .overlay(Capsule().strokeBorder(BriefIQTheme.border, lineWidth: 1))
            }
            ForEach(queries) { q in
                NavigationLink {
                    QueryDetailView(queryID: q.id)
                } label: {
                    QueryRow(query: q)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Text("No queries yet")
                .font(.system(size: 18, weight: .regular, design: .serif))
                .foregroundStyle(BriefIQTheme.text)
            Text("Use the Add tab to track your first question.")
                .font(.system(size: 13))
                .foregroundStyle(BriefIQTheme.text3)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }
}

#Preview {
    QueryListView()
        .preferredColorScheme(.dark)
}
