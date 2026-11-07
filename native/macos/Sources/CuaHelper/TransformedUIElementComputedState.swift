import ApplicationServices

extension TransformedUIElement {
    // 0x1000029fc and 0x100724374 forward the stored element identity/cache.
    var axElement: AXUIElement { element.axElement }
    var cache: UIElementCache { element.cache }

    // 0x10075d2f8 maps captured descriptions. Even an empty list is .some([]).
    // This is not UIElement.actions and must not read the native action list.
    var actions: [UIElementAction]? { actionDescriptions.map(\.action) }

    // 0x1007607d8: a decodable cached Bool (true OR false) suppresses the
    // textual value. Otherwise return the transformed value, not raw AX text.
    var stringValue: String? { element.boolValue == nil ? value : nil }

    var isFocusableOrSelectable: Bool {
        transformedUIElementIsFocusableOrSelectable(isFocusable: isFocusable, isSelectable: isSelectable)
    }
    var hasInterestingActions: Bool { transformedUIElementHasInterestingActions(actions) }
    var canBeUserInteractive: Bool {
        transformedUIElementCanBeUserInteractive(role: role, isFocusable: isFocusable, isSelectable: isSelectable)
    }
}
