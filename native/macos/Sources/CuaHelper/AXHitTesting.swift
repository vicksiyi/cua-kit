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

// Explicit system adapter. The vendor static optional MockProvider branch is not
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

// System branch of 0x1006fb9ac (CFEqual call at 0x1006fba68).
// Cache identity, titles, geometry and object pointer identity are not compared.
// This deliberately does not claim to implement the TaskLocal provider branch.
func systemAXElementsEqual(_ lhs: AXUIElement, _ rhs: AXUIElement) -> Bool {
    CFEqual(lhs, rhs)
}

extension UIElement {
    func representsSameSystemElement(as other: UIElement) -> Bool {
        systemAXElementsEqual(axElement, other.axElement)
    }
}
