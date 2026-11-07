extension TransformedUIElement {
    // 0x10075dbe4 returns a lazy mapping over the captured description array.
    // The mapping reads mutable action constants when iterated, in this order.
    var presentationActions: LazyMapSequence<[UIElementActionDescription], AccessibilityPresentationAction> {
        actionDescriptions.lazy.map { item in
            let kind: AccessibilityPresentationAction.Kind
            if item.action == .press { kind = .press }
            else if item.action == .showMenu { kind = .showMenu }
            else if item.action == .scrollToVisible { kind = .scrollToVisible }
            else { kind = .other }
            return AccessibilityPresentationAction(kind: kind, description: item.description)
        }
    }

    var flattenedRole: UIElementFlattenedRole? {
        transformedUIElementFlattenedRole(role: role)
    }

    // 0x10075c5ec uses stored description/value/title/placeholder, in order.
    // In particular it checks value, not the Bool-filtered stringValue getter.
    var hasDescriptiveAttributes: Bool {
        if let description, !description.isEmpty { return true }
        if let value, !value.isEmpty { return true }
        if let title, !title.isEmpty { return true }
        if let placeholderValue, !placeholderValue.isEmpty { return true }
        return role == .image
    }
}
