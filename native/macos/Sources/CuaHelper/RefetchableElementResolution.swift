import ApplicationServices

// Native refetchElementIfNeeded0x10022e910..0x10022ed10. Keep refresh and
// wrapper construction as explicit boundaries until their concrete bodies are
// restored. No refresh-on-any-error or fixed retry count is added here.
func resolveRefetchableElement<Element, Result>(
    _ element: Element, validateElement: Bool, ignoreValueChange: Bool,
    invalidationState: () throws -> UIElementTreeInvalidationMonitor.State,
    identity: (Element) -> AXUIElement,
    refetch: (Element, Bool) throws -> Result,
    readRoleError: (Element) -> AXError,
    invalidElementError: () -> any Error,
    wrap: (Element) -> Result
) throws -> Result {
    let state = try invalidationState()
    // The source skips even the identity getter after layout invalidation.
    if state.layoutChanged || state.destroyedElements.contains(identity(element)) {
        return try refetch(element, ignoreValueChange)
    }
    if validateElement && readRoleError(element) == .invalidUIElement {
        throw invalidElementError()
    }
    return wrap(element)
}

extension UIElementTreeInvalidationMonitor {
    // Source copies both fields during one lock acquisition, then releases the
    // lock before AX reads/refetch work. It does not consume/reset the latches.
    func invalidationStateSnapshot() -> State { state.withLock { $0 } }
}
