import AppKit

// Second independent query at 0x1007531b0. An absent running-app object
// preserves the AX actual PID; a present app must have prohibited policy (2).
func viewBridgeActualFocusPID<Element>(
    focusedElement: () -> Element?,
    actualPID: (Element) throws -> Int32,
    activationPolicy: (Int32) -> Int?,
    reportError: (Error) -> Void
) -> Int32? {
    guard let element = focusedElement() else { return nil }
    let pid: Int32
    do { pid = try actualPID(element) }
    catch { reportError(error); return nil }
    guard let policy = activationPolicy(pid) else { return pid }
    return policy == 2 ? pid : nil
}

// Concrete AX/AppKit composition; caller preserves the application's current
// transaction cache, and the query independently obtains its focused element.
func viewBridgeActualFocusPID(application: UIElement,
                              transaction: UIElementTransactionCache?,
                              reportError: (Error) -> Void) -> Int32? {
    viewBridgeActualFocusPID(
        focusedElement: { application.focusedUIElementValue(transaction: transaction, reportError: reportError) },
        actualPID: { try $0.axElement.actualPID },
        activationPolicy: { NSRunningApplication(processIdentifier: $0)?.activationPolicy.rawValue },
        reportError: reportError)
}
