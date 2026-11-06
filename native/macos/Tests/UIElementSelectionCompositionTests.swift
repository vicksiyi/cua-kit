import ApplicationServices
import Foundation

@main struct UIElementSelectionCompositionTests {
    static func main() {
        let ax = AXUIElementCreateApplication(424242), parentAX = AXUIElementCreateApplication(424241)
        let role = UIElementAttribute(kAXRoleAttribute), selected = UIElementAttribute(kAXSelectedAttribute)
        let parentKey = UIElementAttribute(kAXParentAttribute)
        let groups = ["AXSelectedRows", "AXSelectedCells", "AXSelectedChildren"].map(UIElementAttribute.init)
        func partial(_ object: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: object), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        func item(_ name: String, support: Set<UIElementAttribute>, requested: Set<UIElementAttribute>? = nil) -> UIElement {
            UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: support,
                attributes: [role: partial(name as NSString)], transactionAttributes: requested))
        }
        var events: [String] = []
        var environment = UIElementActionEnvironment(read: { _, _ in fatalError("unexpected raw read") },
            supported: { _ in events.append("support"); return [selected] },
            nativeActions: { _ in fatalError() },
            settable: { _, key in precondition(key == selected); events.append("settable"); return true },
            write: { _, _, _ in fatalError() }, perform: { _, _ in fatalError() }, count: { _, _ in fatalError() })
        for mask in 0..<8 {
            let expected = groups.enumerated().filter { mask & (1 << $0.offset) != 0 }.map(\.element)
            let element = item("AXButton", support: Set(expected + [role]))
            precondition(element.supportedSelectionAttributes == expected)
            // No selected arrays exist in the cache; capability alone qualifies.
            precondition(element.clickingMayCauseSelection(transaction: nil, environment: environment,
                reportError: { _ in fatalError() }) == !expected.isEmpty)
            precondition(events.isEmpty)
        }
        for name in ["AXMenuItem", "AXMenuBarItem", "AXButton"] {
            events = []
            let element = item(name, support: [role, selected])
            precondition(element.isSelectable(in: environment) == (name == "AXButton"))
            precondition(events == (name == "AXButton" ? ["settable"] : []))
        }
        events = []
        let outsideTransaction = item("AXButton", support: [role], requested: [role])
        precondition(outsideTransaction.isSelectable(in: environment))
        precondition(events == ["support", "settable"])
        environment.settable = { _, _ in throw UIElementError.axError(.cannotComplete) }
        precondition(!outsideTransaction.isSelectable(in: environment))
        // Resolve a real AX reference through the transaction table, without OS reads.
        for parentRole in ["AXButton", "AXApplication"] {
            let parentAttributes = [role: partial(parentRole as NSString), groups[0]: partial([] as NSArray)]
            let transaction = UIElementTransactionCache(attributeTable: [parentAX: parentAttributes],
                requestedAttributes: Set([role, parentKey, selected] + groups),
                fallbackElements: UIElementFallbackCache(initialState: [:]))
            let child = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [role, parentKey],
                attributes: [role: partial("AXStaticText" as NSString), parentKey: partial(parentAX)], transactionAttributes: nil))
            events = []
            precondition(child.clickingMayCauseSelection(transaction: transaction, environment: environment,
                reportError: { _ in fatalError() }) == (parentRole == "AXButton"))
            precondition(events.isEmpty)
        }
        print("selection composition preserves cached groups, writability and transaction ancestry")
    }
}
