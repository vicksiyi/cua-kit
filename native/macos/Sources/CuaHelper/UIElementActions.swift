import Foundation

// 0x100790b88: native read precedes disclosure computation. The helper at
// 0x10076d304 appends the supplemental array (16-byte UIElementAction elements)
// to the native array. It does not sort or deduplicate the combined result.
// readNativeActions must supply the original provider's decoded action array;
// native action-name conversion/deduplication is a separate boundary.
func uiElementActions(
    readNativeActions: () throws -> [UIElementAction],
    supplementalActions: () -> [UIElementAction],
    reportError: (Error) -> Void
) -> [UIElementAction] {
    do {
        var actions = try readNativeActions()
        actions.append(contentsOf: supplementalActions())
        return actions
    } catch {
        reportError(error)
        return []
    }
}

extension UIElement {
    func actions(
        readNativeActions: () throws -> [UIElementAction],
        freshSupportedAttributes: () -> Set<UIElementAttribute>,
        isAttributeSettable: (UIElementAttribute) throws -> Bool,
        reportError: (Error) -> Void
    ) -> [UIElementAction] {
        uiElementActions(readNativeActions: readNativeActions, supplementalActions: {
            uiElementDisclosureActions(cache: cache,
                freshSupportedAttributes: freshSupportedAttributes,
                isAttributeSettable: isAttributeSettable)
        }, reportError: reportError)
    }
}
