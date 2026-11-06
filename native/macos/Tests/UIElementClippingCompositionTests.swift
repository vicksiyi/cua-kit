import ApplicationServices
import Foundation

@main struct UIElementClippingCompositionTests {
    static func main() {
        let childAX = AXUIElementCreateApplication(424242)
        let oldParentAX = AXUIElementCreateApplication(424241), newParentAX = AXUIElementCreateApplication(424240)
        let role = UIElementAttribute(kAXRoleAttribute), parent = UIElementAttribute(kAXParentAttribute)
        let oldFrame = CGRect(x: 0, y: 0, width: 100, height: 100)
        let freshFrame = CGRect(x: 10, y: 20, width: 40, height: 50)
        func partial(_ raw: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: raw), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        func rect(_ value: CGRect) -> AXPartialValue {
            var frame = value
            return partial(AXValueCreate(.cgRect, &frame)!)
        }
        let parents: [AXUIElement: [UIElementAttribute: AXPartialValue]] = [
            oldParentAX: [role: partial("AXWindow" as NSString), .frame: rect(oldFrame)],
            newParentAX: [role: partial("AXWindow" as NSString), .frame: rect(oldFrame)]]
        let transaction = UIElementTransactionCache(attributeTable: parents, requestedAttributes: [role, .frame, parent],
            fallbackElements: UIElementFallbackCache(initialState: [:]))
        let child = UIElement(axElement: childAX, cache: UIElementCache(supportedAttributes: [role, .frame, parent],
            attributes: [role: partial("AXGroup" as NSString), .frame: rect(oldFrame), parent: partial(oldParentAX)], transactionAttributes: nil))
        var events: [String] = []
        var environment = UIElementActionEnvironment(read: { ax, key in
            if key == .frame { events.append("frame"); return (.success, rect(freshFrame)) }
            precondition(key == parent && CFEqual(ax, childAX)); events.append("parent")
            return (.success, partial(newParentAX))
        }, supported: { _ in fatalError() }, nativeActions: { _ in events.append("actions"); return [.scrollDownByPage] },
            settable: { _, _ in fatalError() }, write: { _, _, _ in fatalError() },
            perform: { _, _ in fatalError() }, count: { _, _ in fatalError() })
        precondition(child.clippingFrame(uncached: false, transaction: transaction, environment: environment,
            reportError: { _ in fatalError() }) == oldFrame)
        precondition(events == ["actions"])
        events = []
        precondition(child.clippingFrame(uncached: true, transaction: transaction, environment: environment,
            reportError: { _ in fatalError() }) == freshFrame)
        precondition(events == ["frame", "actions", "parent", "frame"])
        let freshParent = child.clippingParent(uncached: true, transaction: transaction,
            read: { (.success, partial(newParentAX)) }, reportError: { _ in fatalError() })
        precondition(CFEqual(freshParent!.axElement, newParentAX))
        // Refresh failures must not return a stale cached rect.
        for status in [AXError.failure, .success] {
            var errors = 0
            let result = child.clippingFrameAttribute(uncached: true,
                read: { (status, partial("bad" as NSString)) }, reportError: { _ in errors += 1 })
            precondition(result == nil && errors == 1)
        }
        // Known unsupported applies even to forced fresh reads.
        let unsupported = UIElement(axElement: childAX, cache: UIElementCache(supportedAttributes: [role],
            attributes: [:], transactionAttributes: nil))
        precondition(unsupported.clippingFrameAttribute(uncached: true, read: { fatalError() }, reportError: { _ in fatalError() }) == nil)
        for action in [UIElementAction.scrollLeftByPage, .scrollRightByPage, .scrollUpByPage, .scrollDownByPage, .scrollToVisible, .press] {
            environment.nativeActions = { _ in [action, action] }
            precondition(child.hasScrollAction(in: environment, reportError: { _ in fatalError() }) == (action != .scrollToVisible && action != .press))
        }
        print("clipping composition refreshes frames and parent links without stale fallback")
    }
}
