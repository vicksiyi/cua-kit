import Foundation

// Source ApplicationUIElement.MouseEventTarget. Keep the original AX window
// even when the event PID/window/bounds come from an out-of-process surface.
struct MouseEventTarget<Element, Window> {
    let pid: Int32
    let element: Element?
    let accessibilityWindow: Window
    let windowID: UInt32
    let windowBounds: CGRect
    var windowUsesFlippedCoordinates = false
}

enum MouseEventTargetError: Error, Equatable {
    case unableToFindWindowID(UInt32)
}

// 0x10070694c: first ancestor (including self) whose optional actual PID
// matches, then its throwing window ID. Do not continue after an ID error.
func mouseEventWindowID<Node>(for element: Node, appPID: Int32,
    parent: @escaping (Node) -> Node?, actualPID: (Node) -> Int32?,
    windowID: (Node) throws -> UInt32) throws -> UInt32 {
    for node in uiElementParentChain(of: element, maxDepth: 300, includingSelf: true, parent: parent) {
        if actualPID(node) == appPID { return try windowID(node) }
    }
    throw MouseEventWindowSelectionError.noWindows
}

// 0x100705f84..0x100706864. All external reads are supplied so source read
// order, hit-test errors and the AX/WindowServer split remain observable.
func resolveMouseEventTarget<Element, Window, NativeWindow>(at point: CGPoint,
    accessibilityWindow: Window, hitElement: Element?,
    applicationPID: () throws -> Int32, windowActualPID: (Window) throws -> Int32,
    windowID: (Window) throws -> UInt32, windowFrame: (Window) -> CGRect?,
    children: (Element) -> [Element], bundleIdentifier: () -> String?,
    outOfProcessTargetWindow: (Element, Int32) throws -> (pid: Int32, windowID: UInt32)?,
    elementWindowID: (Element) throws -> UInt32, elementActualPID: (Element) -> Int32?,
    ancestorWindowID: (Element, Int32) throws -> UInt32,
    nativeWindowAtPoint: (CGPoint) -> NativeWindow?, nativeWindowID: (NativeWindow) -> UInt32,
    nativeWindowForID: (UInt32) -> NativeWindow?, nativeWindowBounds: (NativeWindow) -> CGRect,
    systemWideHitTest: (CGPoint) throws -> Element?) throws -> MouseEventTarget<Element, Window> {
    let appPID = try applicationPID()
    let seed = try mouseEventRoutingSeed(applicationPID: { appPID },
        windowActualPID: { try windowActualPID(accessibilityWindow) },
        windowID: { try windowID(accessibilityWindow) }, hitElement: hitElement,
        children: children, bundleIdentifier: bundleIdentifier)

    func accessibilityTarget(_ element: Element?, appPID: Int32) throws -> MouseEventTarget<Element, Window> {
        let id: UInt32
        // Only this first ID read swallows all errors (0x1007062cc).
        if let element, let elementID = try? elementWindowID(element) {
            if elementActualPID(element) == appPID { id = elementID }
            else { id = try ancestorWindowID(element, appPID) }
        } else { id = try windowID(accessibilityWindow) }
        return MouseEventTarget(pid: appPID, element: element, accessibilityWindow: accessibilityWindow,
            windowID: id, windowBounds: windowFrame(accessibilityWindow) ?? .zero)
    }
    func nativeTarget(_ destination: (pid: Int32, windowID: UInt32),
        element: Element?) throws -> MouseEventTarget<Element, Window> {
        guard let native = nativeWindowForID(destination.windowID) else {
            throw MouseEventTargetError.unableToFindWindowID(destination.windowID)
        }
        return MouseEventTarget(pid: destination.pid, element: element, accessibilityWindow: accessibilityWindow,
            windowID: destination.windowID, windowBounds: nativeWindowBounds(native))
    }

    let fallback: (pid: Int32, windowID: UInt32)?
    switch seed {
    case .foreignWindow(let pid, let id):
        fallback = (pid, id)
    case .hitElement(let pid, let effectiveElement):
        if let target = try outOfProcessTargetWindow(effectiveElement, pid) { fallback = target }
        else { return try accessibilityTarget(hitElement, appPID: pid) }
    case .noHit(let pid, let useAccessibilityWindowID):
        if useAccessibilityWindowID { return try accessibilityTarget(nil, appPID: pid) }
        fallback = nil
    }

    let native = nativeWindowAtPoint(point)
    // Source reads this even if the native lookup returned nil. Its error
    // takes precedence over fallback/no-windows, and must propagate.
    let axID = try windowID(accessibilityWindow)
    if let native, nativeWindowID(native) == axID,
       let hit = try systemWideHitTest(point) {
        // Unlike the app-root test, system-wide illegalArgument is NOT nil.
        if let target = try outOfProcessTargetWindow(hit, appPID) {
            return try nativeTarget(target, element: hit)
        }
        return try accessibilityTarget(hit, appPID: appPID)
    }
    guard let fallback else { throw MouseEventWindowSelectionError.noWindows }
    // A fallback invalidates the original AX hit; a new system-wide foreign
    // target above retains its hit. Both retain the original AX window.
    return try nativeTarget(fallback, element: nil)
}
