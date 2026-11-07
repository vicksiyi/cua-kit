import ApplicationServices
import Foundation

@main
struct UIElementActionEnvironmentTests {
    static func main() throws {
        let ax = AXUIElementCreateApplication(424242), parentAX = AXUIElementCreateApplication(424241)
        let role = UIElementAttribute(kAXRoleAttribute), disclosing = UIElementAttribute(kAXDisclosingAttribute)
        let parentKey = UIElementAttribute(kAXParentAttribute), childrenKey = UIElementAttribute(kAXChildrenAttribute)
        func partial(_ object: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: object), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        var events: [String] = []
        var environment = UIElementActionEnvironment(
            read: { _, _ in fatalError("unexpected uncached read") },
            supported: { _ in events.append("supported"); return [] },
            nativeActions: { _ in events.append("actions"); return [.press] },
            settable: { _, key in precondition(key == disclosing); events.append("settable"); return true },
            write: { element, value, key in
                precondition(element === ax && key == disclosing)
                events.append("write:\((try! decodeAXBool(value.value, throwingOnFailure: true))!)")
            }, perform: { element, action in events.append("perform:\(element === parentAX ? "parent" : "self"):\(action.name)") },
            count: { _, _ in fatalError("unexpected count") })
        for state in [false, true] {
            let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [role, disclosing], attributes: [
                role: partial("AXButton" as NSString), disclosing: partial(NSNumber(value: state))
            ], transactionAttributes: nil))
            events = []
            let actions = item.actions(in: environment, reportError: { _ in fatalError() })
            precondition(actions == [.press, state ? .collapse : .expand] && events == ["actions", "settable"])
            for action in [UIElementAction.expand, .collapse] {
                events = []
                try item.performAction(action, transaction: nil, environment: environment, reportError: { _ in fatalError() })
                precondition(events == ["settable", "write:\(!state)"])
            }
        }
        let parentAttributes: [UIElementAttribute: AXPartialValue] = [role: partial("AXButton" as NSString), childrenKey: partial([] as NSArray)]
        let transaction = UIElementTransactionCache(attributeTable: [parentAX: parentAttributes],
            requestedAttributes: [role, parentKey, childrenKey, disclosing], fallbackElements: UIElementFallbackCache(initialState: [:]))
        let menu = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [role, parentKey], attributes: [
            role: partial("AXMenuItem" as NSString), parentKey: partial(parentAX)
        ], transactionAttributes: nil))
        events = []
        try menu.performAction(.press, transaction: transaction, environment: environment, reportError: { _ in fatalError() })
        precondition(events == ["supported", "actions", "perform:parent:AXPress", "perform:self:AXPress"])
        var parentReads = 0
        environment.parent = { node, _ in
            parentReads += 1
            return node.axElement === ax
                ? UIElement(axElement: parentAX, cache: UIElementCache(supportedAttributes: Set(parentAttributes.keys), attributes: parentAttributes, transactionAttributes: nil))
                : nil
        }
        events = []
        try menu.performAction(.press, transaction: nil, environment: environment, reportError: { _ in fatalError() })
        precondition(parentReads > 0)
        precondition(events == ["supported", "actions", "perform:parent:AXPress", "perform:self:AXPress"])
        environment.visibleChildren = { node, _ in
            precondition(node.axElement === parentAX)
            events.append("visible-children")
            return []
        }
        events = []
        try menu.performAction(.press, transaction: nil, environment: environment, reportError: { _ in fatalError() })
        precondition(events == ["visible-children", "actions", "perform:parent:AXPress", "perform:self:AXPress"])
        environment.visibleChildren = nil
        environment.parent = nil
        let ordinary = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [role], attributes: [role: partial("AXButton" as NSString)], transactionAttributes: nil))
        events = []
        try ordinary.performAction(.scrollDownByPage, transaction: nil, environment: environment, reportError: { _ in fatalError() })
        precondition(events == ["perform:self:AXScrollDownByPage"])
        let originalPerform = environment.perform
        environment.perform = { element, _ in
            precondition(element === parentAX); events.append("parent-failed")
            throw UIElementError.axError(.failure)
        }
        events = []
        do {
            try menu.performAction(.press, transaction: transaction, environment: environment, reportError: { _ in fatalError() })
            preconditionFailure("ancestor error must propagate")
        } catch UIElementError.axError(let error) { precondition(error == .failure) }
        precondition(events == ["supported", "actions", "parent-failed"])
        environment.perform = originalPerform
        environment.nativeActions = { _ in throw UIElementError.axError(.cannotComplete) }
        events = []
        let actions = ordinary.actions(in: environment, reportError: { _ in events.append("error") })
        precondition(actions.isEmpty && events == ["error"])
        print("action environment preserves disclosure, menu preparation and raw fallback")
    }
}
