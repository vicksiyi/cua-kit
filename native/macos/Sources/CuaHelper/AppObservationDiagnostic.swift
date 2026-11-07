import AppKit
import ApplicationServices

// Operator-only, read-only diagnostic. Emits roles/counts, never app text,
// screenshot data, clipboard content or private window titles.
@MainActor
func appObservationDiagnostic(bundleIdentifier: String) throws -> [String: Any] {
    guard let app = NSWorkspace.shared.runningApplications.first(where: { $0.bundleIdentifier == bundleIdentifier }) else {
        throw fail("TARGET_NOT_FOUND", "Diagnostic application is not running.")
    }
    let root = AXUIElementCreateApplication(app.processIdentifier)
    let raw = readRawAXAttribute(root, kAXChildrenAttribute)
    let rawChildren = raw.value as? [AXUIElement] ?? []
    var reports = 0
    let item = UIElement(element: root)
    let children = item.childrenValue(reportError: { _ in reports += 1 })
    let (nodes, warnings) = try Target(app).collect()
    let windows = readRawAXAttribute(root, kAXWindowsAttribute)
    return ["readOnly": true, "accessibility": AXIsProcessTrusted(),
        "active": app.isActive, "hidden": app.isHidden,
        "rawChildrenStatus": raw.error.rawValue,
        "rawChildRoles": rawChildren.map { string($0, kAXRoleAttribute) },
        "rootIsOwnChild": rawChildren.contains { CFEqual($0, root) },
        "decodedChildRoles": children.map { $0.role.rawValue },
        "collectionReadErrors": reports,
        "windowsStatus": windows.error.rawValue,
        "windowCount": (windows.value as? [AXUIElement])?.count ?? 0,
        "windowRoles": (windows.value as? [AXUIElement] ?? []).map { string($0, kAXRoleAttribute) },
        "windowsContainRoot": (windows.value as? [AXUIElement] ?? []).contains { CFEqual($0, root) },
        "collectedRoleCounts": Dictionary(nodes.map { ($0.data["role"] as? String ?? "", 1) }, uniquingKeysWith: +),
        "traversalWarnings": warnings]
}
