import ApplicationServices

// Source0x1007a4ee8: a missing full collection, absent span, or largest span
// smaller than the partial array preserves the original partial result.
func buildUIElementVisibleSubset<Element, Identity: Hashable>(
    partial: (array: [Element], subsetDescriptor: AXArraySubsetDescriptor?), minimumCount: Int,
    identity: (Element) -> Identity, fullCollection: () -> [Identity]?,
    initialize: (Identity) -> Element
) -> (array: [Element], subsetDescriptor: AXArraySubsetDescriptor?) {
    guard let full = fullCollection() else { return partial }
    let spans = uiElementVisibleIndexRanges(full: full, visible: Set(partial.array.map(identity)))
    guard let span = selectUIElementVisibleRanges(spans, limit: 1).first,
          span.count >= partial.array.count else { return partial }
    let expanded = expandUIElementVisibleRange(span, minimumCount: minimumCount, totalCount: full.count)
    let array = full[expanded].map(initialize)
    let descriptor: AXArraySubsetDescriptor? = array.count == full.count ? nil :
        .init(count: full.count, availableRanges: [expanded.lowerBound..<(expanded.upperBound + 1)])
    return (array, descriptor)
}

extension UIElementProtocol {
    func visibleElementsCalculatingSubset(using attribute: UIElementAttribute,
        includeSurroundingElementsUpToMax minimumCount: Int,
        reportError: (Error) -> Void
    ) -> (array: [UIElement], subsetDescriptor: AXArraySubsetDescriptor?)? {
        guard let partial = try? partialArrayValue(for: attribute, maxCount: 500) else { return nil }
        return buildUIElementVisibleSubset(partial: partial, minimumCount: minimumCount,
            identity: { $0.axElement }, fullCollection: {
                collectionContainingVisibleElements(partial.array, using: attribute, reportError: reportError)
            }, initialize: { UIElement(element: $0) })
    }
}
