// Prefix of target(forMouseEventAt:axWindowAtPoint:axElementAtPoint:),
// 0x100705fe4..0x100706214. This is an internal intermediate value;
// WindowServer fallback/final MouseEventTarget assembly remain separate.
enum MouseEventRoutingSeed<Element> {
    case foreignWindow(pid: Int32, windowID: UInt32)
    case hitElement(appPID: Int32, effectiveElement: Element)
    case noHit(appPID: Int32, useAccessibilityWindowID: Bool)
}

func mouseEventRoutingSeed<Element>(applicationPID: () throws -> Int32,
    windowActualPID: () throws -> Int32, windowID: () throws -> UInt32,
    hitElement: Element?, children: (Element) -> [Element], bundleIdentifier: () -> String?) throws -> MouseEventRoutingSeed<Element> {
    let appPID = try applicationPID()
    let windowPID = try windowActualPID()
    if windowPID != appPID { return .foreignWindow(pid: windowPID, windowID: try windowID()) }
    if let hitElement { return .hitElement(appPID: appPID, effectiveElement: children(hitElement).first ?? hitElement) }
    // Source String.hasPrefix import (0x101150b34), not exact equality.
    return .noHit(appPID: appPID, useAccessibilityWindowID: bundleIdentifier()?.hasPrefix("com.openai.atlas") ?? false)
}
