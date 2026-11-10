import ApplicationServices

// Source0x1007a4bd0..0x1007a4e00 groups consecutive true flags. All-ranges
// mode preserves them without surrounding expansion; single mode selects the
// largest run and expands only that run. No visible run yields nil.
func buildUIElementPositionSubset<Identity, Element>(full: [Identity], visibility: [Bool],
    minimumCount: Int, includeAllVisibleItemRanges: Bool, initialize: (Identity) -> Element
) -> (array: [Element], subsetDescriptor: AXArraySubsetDescriptor?)? {
    precondition(full.count == visibility.count)
    var ranges: [ClosedRange<Int>] = []
    var start: Int?
    for (index, visible) in visibility.enumerated() {
        if visible {
            if start == nil { start = index }
        } else if let lower = start {
            ranges.append(lower...(index - 1)); start = nil
        }
    }
    if let lower = start { ranges.append(lower...(full.count - 1)) }
    guard !ranges.isEmpty else { return nil }
    if !includeAllVisibleItemRanges {
        let selected = selectUIElementVisibleRanges(ranges, limit: 1)[0]
        ranges = [expandUIElementVisibleRange(selected, minimumCount: minimumCount, totalCount: full.count)]
    }
    let array = ranges.flatMap { full[$0].map(initialize) }
    let descriptor: AXArraySubsetDescriptor? = array.count == full.count ? nil :
        .init(count: full.count, availableRanges: ranges.map { $0.lowerBound..<($0.upperBound + 1) })
    return (array, descriptor)
}

extension UIElementProtocol {
    func allChildrenFilteringVisibleElementsByPosition(includeSurroundingElementsUpToMax minimumCount: Int,
        includeAllVisibleItemRanges: Bool, clippingFrame: CGRect?, reportError: (Error) -> Void
    ) -> (array: [UIElement], subsetDescriptor: AXArraySubsetDescriptor?)? {
        guard let full = completeAXElementCollectionValue(for: UIElementAttribute("AXChildren"),
            reportError: reportError) else { return nil }
        let parent = frameValue(reportError: reportError)
        // Read AXFrame directly for each child. This path does not substitute
        // AXPosition/AXSize or use an old child's provider cache.
        let frames = full.map { child -> CGRect? in
            guard let partial = child.value(for: .frame).value else { return nil }
            return try? decodeAXRect(partial.value.value, throwingOnFailure: false)
        }
        let visibility = uiElementPositionVisibility(parentFrame: parent, clippingFrame: clippingFrame,
            childFrames: frames)
        return buildUIElementPositionSubset(full: full, visibility: visibility, minimumCount: minimumCount,
            includeAllVisibleItemRanges: includeAllVisibleItemRanges, initialize: { UIElement(element: $0) })
    }
}
