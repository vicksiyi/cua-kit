import ApplicationServices

extension ApplicationUIElement {
    func windowValue(for attribute: UIElementAttribute,
        initialize: (AXUIElement) -> WindowUIElement,
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> WindowUIElement? {
        uiElementAttributeValue(ignoringTypeMismatch: false,
            cachedValue: {
                uiElementCachedValue(attribute, readCache: { cache }) {
                    try? decodeAXWindow($0.value.value, throwingOnFailure: false, initialize: initialize)
                }
            }, uncachedValue: { ignore in
                uiElementUncachedValue(operation: {
                    try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                        isKnownUnsupported: { attributeIsKnownUnsupported(attribute) }, read: read,
                        decode: { try? decodeAXWindow($0.value.value, throwingOnFailure: false, initialize: initialize) },
                        decodeThrowing: { try decodeAXWindow($0.value.value, throwingOnFailure: true, initialize: initialize) })
                }, reportError: reportError)
            })
    }

    private func windowValue(for attribute: UIElementAttribute) -> WindowUIElement? {
        windowValue(for: attribute, initialize: { WindowUIElement(element: $0) },
            read: { axElement.value(for: attribute) }, reportError: reportAttributeReadError)
    }

    var focusedWindow: WindowUIElement? { windowValue(for: UIElementAttribute(kAXFocusedWindowAttribute)) }
    var mainWindow: WindowUIElement? { windowValue(for: UIElementAttribute(kAXMainWindowAttribute)) }
    var windows: [WindowUIElement] {
        elementCollectionValue(for: UIElementAttribute(kAXWindowsAttribute), as: WindowUIElement.self,
            reportError: reportAttributeReadError)
    }
    var primaryWindow: WindowUIElement? {
        applicationPrimaryWindow(focusedWindow: { focusedWindow }, mainWindow: { mainWindow }, windows: { windows })
    }
}
