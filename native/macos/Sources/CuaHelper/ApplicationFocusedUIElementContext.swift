import ApplicationServices

extension ApplicationUIElement {
    var focusedUIElement: UIElement? {
        let attribute = UIElementAttribute(kAXFocusedUIElementAttribute)
        return elementValue(for: attribute, initialize: { UIElement(element: $0) },
            read: { axElement.value(for: attribute) }, reportError: reportAttributeReadError)
    }

    // Native0x1007861d0 first requires a primary window. Focus reading uses
    // the shared cached/strict-uncached accessor, reporting errors as nil; CG
    // window resolution failure remains a thrown context construction error.
    func focusedUIElementContext() throws -> FocusedUIElementContext {
        try focusedUIElementContext(readPrimaryWindow: { primaryWindow },
            readFocusedElement: { focusedUIElement },
            resolve: { $0.applicationWindowDescription(axApplication: $1, reportError: reportAttributeReadError) })
    }

    func focusedUIElementContext(readPrimaryWindow: () -> WindowUIElement?,
        readFocusedElement: () -> UIElement?,
        resolve: (WindowUIElement, ApplicationUIElement) -> NativeWindowDescription?
    ) throws -> FocusedUIElementContext {
        guard let window = readPrimaryWindow() else { throw FocusedUIElementContext.Error.noWindowsAvailable }
        let element = readFocusedElement()
        return try FocusedUIElementContext(app: self, window: window, element: element, resolve: resolve)
    }
}
