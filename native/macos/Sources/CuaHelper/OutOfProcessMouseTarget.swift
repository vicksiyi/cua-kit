import Foundation
import os

// 0x100706df0: use the FIRST containing regular-app/view-service process.
// A regular app terminates discovery with nil, even if a later ancestor would
// be a foreign view service. Only a differing event-service PID is selected.
func selectOutOfProcessMouseTarget<Node>(for element: Node, appPID: Int32,
    containingElement: (Node, Set<UIElement.ProcessType>) -> (element: Node, processType: UIElement.ProcessType, pid: Int32)?,
    reportMissingContainer: () -> Void) -> (pid: Int32, effectiveElement: Node)? {
    guard let selected = containingElement(element, [.regularApp, .viewService]) else {
        reportMissingContainer()
        return nil
    }
    guard selected.processType != .regularApp, selected.pid != appPID else { return nil }
    return (selected.pid, selected.element)
}

extension UIElementProtocol {
    func outOfProcessMouseTarget(appPID: Int32, reportError: @escaping (Error) -> Void) -> (pid: Int32, effectiveElement: any UIElementProtocol)? {
        let root: any UIElementProtocol = self
        return selectOutOfProcessMouseTarget(for: root, appPID: appPID,
            containingElement: { element, types in
                UIElement.ProcessType.containingElement(for: element, ofTypes: types, reportError: reportError)
            }, reportMissingContainer: {
                Logger(subsystem: "core.cua", category: "Accessibility").error("Mouse target has no containing event-handling process")
            })
    }
}

// 0x100706fa4 / 0x1007072b4: walk including self, accept the first ID
// (including zero), skip illegalArgument only, and stop at a window/sheet
// without an ID rather than searching beyond that boundary.
func outOfProcessMouseWindowID<Node>(for element: Node,
    parent: @escaping (Node) -> Node?, windowID: (Node) throws -> UInt32,
    role: (Node) -> UIElementRole) throws -> UInt32 {
    for node in uiElementParentChain(of: element, maxDepth: 300, includingSelf: true, parent: parent) {
        let id: UInt32?
        do { id = try windowID(node) }
        catch UIElementError.axError(let error) where error == .illegalArgument { id = nil }
        if let id { return id }
        if role(node) == .window || role(node) == .sheet { break }
    }
    throw MouseEventWindowSelectionError.noWindows
}

extension UIElementProtocol {
    func outOfProcessMouseTargetWindow(appPID: Int32, reportError: @escaping (Error) -> Void) throws -> (pid: Int32, windowID: UInt32)? {
        guard let target = outOfProcessMouseTarget(appPID: appPID, reportError: reportError) else { return nil }
        let id = try outOfProcessMouseWindowID(for: target.effectiveElement,
            parent: { $0.parentValue(reportError: reportError) }, windowID: { try $0.axElement.windowID }, role: { $0.role })
        return (target.pid, id)
    }
}
