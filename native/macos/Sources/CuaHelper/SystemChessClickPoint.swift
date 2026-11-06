import AppKit
import ApplicationServices

// System fallback of AXUIElementRef.bundleIdentifier, 0x1006fa57c..<0x1006fa628.
// A failed PID read or missing running app/bundle returns nil, without launching.
func systemAXBundleIdentifier(_ element: AXUIElement) -> String? {
    guard let pid = resolvedAXProcessID(element) else { return nil }
    return NSRunningApplication(processIdentifier: pid)?.bundleIdentifier
}

extension UIElement {
    func systemChessPreferredPoint(
        transaction: UIElementTransactionCache?, reportError: (Error) -> Void
    ) -> CGPoint? {
        chessPreferredPoint(transaction: transaction,
            bundleIdentifier: { systemAXBundleIdentifier(axElement) },
            resolveApp: { systemRunningApplicationElement(bundleIdentifier: $0, transaction: transaction) },
            hitTest: { try systemAXElementAtPoint($1, in: $0.axElement, transaction: transaction) },
            matches: { $0.representsSameSystemElement(as: $1) },
            read: readSystemAXAttributeValue, reportError: reportError)
    }
}
