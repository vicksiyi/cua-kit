import ApplicationServices

struct SafeActivationSavedWindow<Window> {
    let window: Window?
    let id: UInt32?
}

// 0x100741b60..0x100741cc8. Retain the focused AX window even if
// its WindowServer ID cannot be read. ID failure is discarded, not propagated;
// do not replace a missing focused window with another visible window.
func captureSafeActivationSavedWindow<Window>(focusedWindow: () -> Window?,
    windowID: (Window) throws -> UInt32) -> SafeActivationSavedWindow<Window> {
    let window = focusedWindow()
    let id = window.flatMap { try? windowID($0) }
    return SafeActivationSavedWindow(window: window, id: id)
}

extension UIElement {
    // focusedWindow's getter 0x100718904 uses the same cached/provider-aware
    // element decoding pipeline, with AXFocusedWindow instead of AXParent.
    func focusedWindowValue(transaction: UIElementTransactionCache?,
        read: () -> (error: AXError, value: AXPartialValue?), reportError: (Error) -> Void) -> UIElement? {
        elementValue(for: UIElementAttribute("AXFocusedWindow"), transaction: transaction,
            read: read, reportError: reportError)
    }
    func focusedWindowValue(transaction: UIElementTransactionCache?, reportError: (Error) -> Void) -> UIElement? {
        let attribute = UIElementAttribute("AXFocusedWindow")
        return focusedWindowValue(transaction: transaction, read: { axElement.value(for: attribute) }, reportError: reportError)
    }
}

func systemSafeActivationSavedWindow(application: UIElement,
    transaction: UIElementTransactionCache?, reportError: (Error) -> Void) -> SafeActivationSavedWindow<UIElement> {
    captureSafeActivationSavedWindow(focusedWindow: {
        application.focusedWindowValue(transaction: transaction, reportError: reportError)
    }, windowID: { try $0.axElement.windowID })
}

func systemSafeActivationWindowOrder(saved: SafeActivationSavedWindow<UIElement>, targetPID: Int32) throws -> Bool {
    try restoreSafeActivationWindowOrder(savedWindowID: saved.id, targetPID: targetPID,
        windows: safeActivationOnScreenWindows,
        raiseSavedWindow: saved.window.map { window in { try window.perform(action: .raise) } })
}
