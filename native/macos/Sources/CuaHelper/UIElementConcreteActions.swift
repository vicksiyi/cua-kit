// Concrete UIElement composition of the restored actions getter and cached
// disclosure capabilities. Read/provider and logger boundaries stay explicit.
extension UIElement {
    func actions(
        readNativeActions: () throws -> [UIElementAction],
        freshSupportedAttributes: () -> Set<UIElementAttribute>,
        isAttributeSettable: (UIElementAttribute) throws -> Bool,
        reportError: (Error) -> Void
    ) -> [UIElementAction] {
        uiElementActions(readActions: readNativeActions, isDisclosable: {
            uiElementIsAttributeSupportedAndSettable(UIElementAttribute("AXDisclosing"),
                readCache: { cache }, freshSupportedAttributes: freshSupportedAttributes,
                isAttributeSettable: isAttributeSettable)
        }, isDisclosing: { uiElementIsDisclosing(cache: cache) }, reportError: reportError)
    }
}
