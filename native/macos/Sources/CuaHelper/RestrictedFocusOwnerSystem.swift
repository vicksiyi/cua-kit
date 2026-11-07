import AppKit
import ApplicationServices

// Concrete AX composition for the restricted branch; the final application
// ownership/workspace fallback is supplied by the enclosing common resolver.
func systemRestrictedFocusOwnerPID(
    _ pid: Int32, transaction: UIElementTransactionCache?,
    fallback: () -> Int32, reportError: (Error) -> Void
) -> Int32 {
    let application = UIElement(systemElement: AXUIElementCreateApplication(pid), transaction: transaction)
    func window(_ name: String) -> UIElement? {
        let attribute = UIElementAttribute(name)
        return application.elementValue(for: attribute, transaction: transaction,
            read: { application.axElement.value(for: attribute) }, reportError: reportError)
    }
    return restrictedFocusOwnerPID(applicationPID: { try application.axElement.pid },
        windowPID: {
            focusOwnerWindowPID(focusedWindow: { window("AXFocusedWindow") }, mainWindow: { window("AXMainWindow") },
                readPID: { try $0.axElement.pid }, reportError: reportError)
        }, activationPolicy: { NSRunningApplication(processIdentifier: $0)?.activationPolicy.rawValue },
        fallback: fallback, reportError: reportError)
}

func systemFocusedElementOwnerPID(
    element: UIElement?, transaction: UIElementTransactionCache?,
    missingElementFallback: () -> Int32, reportError: (Error) -> Void
) -> Int32 {
    focusedElementOwnerPID(element: element, readPID: { try $0.axElement.pid },
        activationPolicy: { NSRunningApplication(processIdentifier: $0)?.activationPolicy.rawValue },
        resolveRestrictedPID: { pid in
            systemRestrictedFocusOwnerPID(pid, transaction: transaction,
                fallback: missingElementFallback, reportError: reportError)
        }, missingElementFallback: missingElementFallback, reportError: reportError)
}
