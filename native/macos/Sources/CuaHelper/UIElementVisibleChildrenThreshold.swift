import CoreGraphics

enum VisibleChildrenLimitReason { case webEventStream, positionFallback }

// Native7a41e0..7a44f4. Returned values include caller's subset descriptor;
// preserve nil/empty distinctions and do not invent fallbacks after a selected
// visible-attribute reader returns nil. Concrete geometry readers are separate.
func selectTreeChildren<Result>(threshold: Int, contextType: UIElementContextType,
    isWebShaped: Bool, clippingFrame: CGRect?, childCount: () -> Int?,
    visibleAttribute: () -> UIElementAttribute?,
    visibleSubset: (UIElementAttribute, Int) -> Result?,
    partialChildren: () throws -> Result?,
    positionFiltered: (Int, Bool, CGRect?) -> Result?,
    reportLimit: (VisibleChildrenLimitReason) -> Void
) -> Result? {
    guard let count = childCount(), count > 0 else { return nil }
    if contextType == .eventStreamContext && isWebShaped {
        guard count < 500 else { reportLimit(.webEventStream); return nil }
        return positionFiltered(0, true, clippingFrame)
    }
    if count <= threshold { return try? partialChildren() }
    if let attribute = visibleAttribute() { return visibleSubset(attribute, 0) }
    guard count < 500 else { reportLimit(.positionFallback); return nil }
    return positionFiltered(100, false, nil)
}

extension UIElementProtocol {
    // Source-bound concrete count/attribute/partial-array reads with explicit
    // reader overrides. The overload below supplies native subset composition.
    // Default argument thunk0x10071b8c8 returns100 via merged constant0x1007a44ec.
    func visibleChildrenIfChildrenExceedsThreshold(_ threshold: Int = 100, context: UIElementTransformationContext,
        visibleSubset: (UIElementAttribute, Int) -> (array: [UIElement], subsetDescriptor: AXArraySubsetDescriptor?)?,
        positionFiltered: (Int, Bool, CGRect?) -> (array: [UIElement], subsetDescriptor: AXArraySubsetDescriptor?)?,
        reportLimit: (VisibleChildrenLimitReason) -> Void
    ) -> (array: [UIElement], subsetDescriptor: AXArraySubsetDescriptor?)? {
        selectTreeChildren(threshold: threshold, contextType: context.type, isWebShaped: context.isWebShaped,
            clippingFrame: context.windowFrame, childCount: { childCount },
            visibleAttribute: { preferredVisibleChildrenAttribute() }, visibleSubset: visibleSubset,
            partialChildren: { try partialArrayValue(for: UIElementAttribute("AXChildren"), maxCount: nil) },
            positionFiltered: positionFiltered, reportLimit: reportLimit)
    }
}

extension UIElementProtocol {
    // Concrete visible-attribute branch of0x1007a41e0. The position-based
    // reader remains explicit until its geometry/filtering behavior is restored.
    func visibleChildrenIfChildrenExceedsThreshold(_ threshold: Int = 100,
        context: UIElementTransformationContext,
        positionFiltered: (Int, Bool, CGRect?) -> (array: [UIElement], subsetDescriptor: AXArraySubsetDescriptor?)?,
        reportLimit: (VisibleChildrenLimitReason) -> Void
    ) -> (array: [UIElement], subsetDescriptor: AXArraySubsetDescriptor?)? {
        visibleChildrenIfChildrenExceedsThreshold(threshold, context: context,
            visibleSubset: { attribute, minimum in
                visibleElementsCalculatingSubset(using: attribute,
                    includeSurroundingElementsUpToMax: minimum,
                    reportError: reportAttributeReadError)
            }, positionFiltered: positionFiltered, reportLimit: reportLimit)
    }
}

extension UIElementProtocol {
    // Both concrete readers now use the recovered provider implementations.
    func visibleChildrenIfChildrenExceedsThreshold(_ threshold: Int = 100,
        context: UIElementTransformationContext, reportLimit: (VisibleChildrenLimitReason) -> Void
    ) -> (array: [UIElement], subsetDescriptor: AXArraySubsetDescriptor?)? {
        visibleChildrenIfChildrenExceedsThreshold(threshold, context: context,
            positionFiltered: { minimum, allRanges, clip in
                allChildrenFilteringVisibleElementsByPosition(includeSurroundingElementsUpToMax: minimum,
                    includeAllVisibleItemRanges: allRanges, clippingFrame: clip,
                    reportError: reportAttributeReadError)
            }, reportLimit: reportLimit)
    }
}
