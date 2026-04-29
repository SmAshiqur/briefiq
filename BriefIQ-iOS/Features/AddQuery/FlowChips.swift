// FlowChips.swift
// Tiny wrapping flow layout for the suggestion chips. SwiftUI doesn't ship
// a built-in flow layout pre-iOS 16's Layout protocol; using Layout keeps
// the implementation small and avoids GeometryReader headaches.

import SwiftUI

/// A horizontal layout that wraps to a new row when content overflows.
struct FlowChips<Item: Hashable, ChipContent: View>: View {
    let items: [Item]
    @ViewBuilder let chip: (Item) -> ChipContent

    var body: some View {
        FlowLayout(spacing: 7) {
            ForEach(items, id: \.self) { item in
                chip(item)
            }
        }
    }
}

/// The actual layout. Walks proposed sizes child-by-child and wraps when
/// the next chip wouldn't fit on the current row.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var rows: [CGFloat] = [0]
        var rowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0

        for sv in subviews {
            let s = sv.sizeThatFits(.unspecified)
            if rows.last! + s.width > maxWidth, rows.last! > 0 {
                totalHeight += rowHeight + spacing
                rowHeight = 0
                rows.append(0)
            }
            rows[rows.count - 1] += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
        totalHeight += rowHeight
        return CGSize(width: maxWidth, height: totalHeight)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        let maxWidth = bounds.width
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var rowHeight: CGFloat = 0

        for sv in subviews {
            let s = sv.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            sv.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: s.width, height: s.height))
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
            _ = maxWidth
        }
    }
}
