import Foundation
import ApplicationServices

// Read-only diagnostic, not a production traversal limit or graph rewrite.
func inspectInitialWindowGraph(pid: Int32) -> [String: Any] {
    func children(_ element: AXUIElement) -> [AXUIElement] {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value) == .success else { return [] }
        return value as? [AXUIElement] ?? []
    }
    let app = AXUIElementCreateApplication(pid)
    var primary: CFTypeRef?
    let status = AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute as CFString, &primary)
    guard status == .success, let primary, CFGetTypeID(primary) == AXUIElementGetTypeID() else {
        return ["error": "NO_FOCUSED_WINDOW", "axStatus": status.rawValue]
    }
    let window = unsafeBitCast(primary, to: AXUIElement.self)
    var queue: [(AXUIElement, [AXUIElement])] = children(window).map { ($0, [window]) }
    var edges = 0, cycles = 0
    var unique: [AXUIElement] = []
    while !queue.isEmpty && edges < 500 {
        let (element, ancestors) = queue.removeFirst()
        edges += 1
        if ancestors.contains(where: { CFEqual($0, element) }) { cycles += 1; continue }
        if !unique.contains(where: { CFEqual($0, element) }) { unique.append(element) }
        queue.append(contentsOf: children(element).map { ($0, ancestors + [element]) })
    }
    var providerQueue = UIElement(element: window).childrenValue(reportError: { _ in })
    var providerSeen: [AXUIElement] = [window]
    var providerReads = 0, providerRepeats = 0, mismatches = 0
    while !providerQueue.isEmpty && providerReads < 100 {
        let element = providerQueue.removeFirst()
        providerReads += 1
        if providerSeen.contains(where: { CFEqual($0, element.axElement) }) {
            providerRepeats += 1
            continue
        }
        providerSeen.append(element.axElement)
        let wrapped = element.childrenValue(reportError: { _ in })
        let raw = children(element.axElement)
        if raw.count != wrapped.count || !zip(raw, wrapped).allSatisfy({ CFEqual($0, $1.axElement) }) { mismatches += 1 }
        providerQueue.append(contentsOf: wrapped)
    }
    return ["providerReads": providerReads, "providerRepeats": providerRepeats,
            "providerRawMismatches": mismatches, "providerLimitReached": !providerQueue.isEmpty,
            "pid": pid, "edges": edges, "uniqueElements": unique.count,
            "ancestorCycles": cycles, "diagnosticLimitReached": !queue.isEmpty]
}
