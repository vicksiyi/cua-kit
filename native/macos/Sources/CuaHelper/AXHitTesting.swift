import ApplicationServices

// System branch 0x1006f7c24 and closure 0x1006f7ea8: CGPoint's Double
// coordinates are converted to Float for AXUIElementCopyElementAtPosition.
// Unlike some attribute/action helpers, only AXError.success is accepted here.
func copiedAXElementAtPoint<Element>(
    _ point: CGPoint,
    copy: (Float, Float, inout AXUIElement?) -> AXError,
    construct: (AXUIElement) -> Element
) throws -> Element? {
    var found: AXUIElement?
    let status = copy(Float(point.x), Float(point.y), &found)
    guard status == .success else { throw UIElementError.axError(status) }
    return found.map(construct)
}

// Explicit system adapter. The vendor TaskLocal MockProvider branch is not
// replaced; transaction ownership remains supplied by the caller.
func systemAXElementAtPoint(
    _ point: CGPoint, in element: AXUIElement,
    transaction: UIElementTransactionCache?
) throws -> UIElement? {
    let targetPID = resolvedAXProcessID(element)
    return try onAXAttributeReadThread(targetPID: targetPID) {
        try copiedAXElementAtPoint(point, copy: { x, y, result in
            AXUIElementCopyElementAtPosition(element, x, y, &result)
        }, construct: { UIElement(systemElement: $0, transaction: transaction) })
    }
}
