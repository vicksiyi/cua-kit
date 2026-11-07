import ApplicationServices

extension UIElement {
    // Constructor 0x10075fbc4..<0x10075fc34. Reuse the common action
    // resolver but use captured transformed disclosure flags, not fresh
    // UIElement capability getters (0x100790a88..0x100790aa0).
    func transformedActionDescriptions(
        contextType: UIElementContextType,
        capturedIsDisclosable: Bool,
        capturedIsDisclosing: Bool,
        reportError: (Error) -> Void
    ) -> [UIElementActionDescription] {
        guard contextType.includesActionDescriptions else { return [] }
        return uiElementActionDescriptions(readActions: {
            uiElementActions(readActions: { try axElement.actions },
                isDisclosable: { capturedIsDisclosable },
                isDisclosing: { capturedIsDisclosing }, reportError: reportError)
        }, readNativeDescription: { try axElement.description(for: $0) }, reportError: reportError)
    }
}
