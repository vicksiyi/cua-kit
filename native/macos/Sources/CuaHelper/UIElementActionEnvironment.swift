import ApplicationServices

// Explicit composition boundary for the restored action getters/dispatcher.
// This is standalone wiring, not a replacement for the original static optional MockProvider.
struct UIElementActionEnvironment {
    var read: (AXUIElement, UIElementAttribute) -> (error: AXError, value: AXPartialValue?)
    var supported: (AXUIElement) -> Set<UIElementAttribute>
    var nativeActions: (AXUIElement) throws -> [UIElementAction]
    var settable: (AXUIElement, UIElementAttribute) throws -> Bool
    var write: (AXUIElement, AXEncodedValue, UIElementAttribute) throws -> Void
    var perform: (AXUIElement, UIElementAction) throws -> Void
    var count: (AXUIElement, UIElementAttribute) -> (error: AXError, count: Int)

    var parent: ((UIElement, (Error) -> Void) -> UIElement?)? = nil

    var visibleChildren: ((UIElement, (Error) -> Void) -> [UIElement])? = nil

    static var system: Self {
        Self(read: readSystemAXAttributeValue,
            supported: { Set(decodedAXSupportedAttributes(readRawAXAttributeNames($0))) },
            nativeActions: readSystemAXActions,
            settable: isSystemAXAttributeSettable,
            write: setSystemAXAttribute,
            perform: performSystemAXAction,
            count: readSystemAXArrayCount)
    }
}

extension UIElement {
    func actions(in environment: UIElementActionEnvironment, reportError: (Error) -> Void) -> [UIElementAction] {
        actions(readNativeActions: { try environment.nativeActions(axElement) },
            freshSupportedAttributes: { environment.supported(axElement) },
            isAttributeSettable: { try environment.settable(axElement, $0) }, reportError: reportError)
    }

    func performAction(
        _ action: UIElementAction, transaction: UIElementTransactionCache?,
        environment: UIElementActionEnvironment, reportError: @escaping (Error) -> Void
    ) throws {
        try dispatchUIElementAction(action, role: role,
            parentChain: {
                if let parent = environment.parent {
                    return uiElementParentChain(of: self, maxDepth: 300, includingSelf: false) {
                        parent($0, reportError)
                    }
                }
                return systemParentChain(includingSelf: false, transaction: transaction,
                    read: environment.read, reportError: reportError)
            }, childrenAreEmpty: { parent in
                if let children = environment.visibleChildren {
                    return children(parent, reportError).isEmpty
                }
                return parent.systemChildrenPreferringVisible(transaction: transaction,
                    freshSupportedAttributes: { environment.supported(parent.axElement) },
                    readArrayCount: { environment.count(parent.axElement, $0) },
                    read: { environment.read(parent.axElement, $0) }, reportError: reportError).isEmpty
            }, actions: { $0.actions(in: environment, reportError: reportError) },
            performAncestor: { parent, action in
                try parent.performAction(action, transaction: transaction, environment: environment, reportError: reportError)
            }, toggleDisclosure: {
                try toggleDisclosureWritingValue(freshSupportedAttributes: { environment.supported(axElement) },
                    isAttributeSettable: { try environment.settable(axElement, $0) }, write: environment.write)
            }, scrollUsingScrollBar: { direction in
                try scrollUsingSystemScrollBar(direction: direction, transaction: transaction, read: environment.read,
                    perform: { button, action in
                        try button.performAction(action, transaction: transaction, environment: environment, reportError: reportError)
                    }, reportError: reportError)
            }, performAXAction: { try environment.perform(axElement, $0) })
    }
}
