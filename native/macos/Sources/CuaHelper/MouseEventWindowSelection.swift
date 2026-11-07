import ApplicationServices

// Semantic error cases from target(forMouseEventAt:with:), not wire tags.
enum MouseEventWindowSelectionError: Error, Equatable {
    case noWindows
    case noWindowAtPoint(CGPoint)
}

// 0x100705e5c: first window in caller order whose optional AX frame contains
// the point. Do not sort, consult WindowServer or substitute a focused window.
func mouseEventWindowAtPoint<Window>(_ point: CGPoint, windows: [Window],
    frame: (Window) -> CGRect?) -> Window? {
    windows.first { window in frame(window).map { $0.contains(point) } ?? false }
}

// 0x100707390: only native UIElementError.axError(-25201) becomes nil.
// Preserve all other errors and a successful nil hit.
func mouseEventElementAtPoint<Element>(hitTest: () throws -> Element?) throws -> Element? {
    do { return try hitTest() }
    catch UIElementError.axError(let error) where error == .illegalArgument { return nil }
}

// 0x100705c44..0x100705e1c: resolve the containing AX window before app-root
// hit testing, then delegate complete target/PID/window routing to its owner.
func resolveMouseEventWindowAndElement<Window, Element, Target>(_ point: CGPoint, windows: [Window],
    frame: (Window) -> CGRect?, hitTest: () throws -> Element?,
    makeTarget: (Window, Element?) throws -> Target) throws -> Target {
    guard !windows.isEmpty else { throw MouseEventWindowSelectionError.noWindows }
    guard let window = mouseEventWindowAtPoint(point, windows: windows, frame: frame) else {
        throw MouseEventWindowSelectionError.noWindowAtPoint(point)
    }
    return try makeTarget(window, mouseEventElementAtPoint(hitTest: hitTest))
}

extension UIElement {
    func mouseEventElement(at point: CGPoint) throws -> UIElement? {
        try mouseEventElementAtPoint { try axElement.element(at: point) }
    }
}
