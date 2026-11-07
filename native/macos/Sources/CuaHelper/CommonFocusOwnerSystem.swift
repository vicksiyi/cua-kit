import AppKit
import ApplicationServices
import Darwin

func systemCommonFocusOwnerPID(
    application: UIElement, element: UIElement?, skipApplicationOwner: Bool,
    transaction: UIElementTransactionCache?, reportError: (Error) -> Void
) -> Int32 {
    let focused = element ?? application.focusedUIElementValue(transaction: transaction, reportError: reportError)
    func fallback() -> Int32 {
        focusOwnerPIDWithoutElement(skipApplicationOwner: skipApplicationOwner,
            applicationOwnerPID: {
                let pid: Int32
                do { pid = try application.axElement.pid }
                catch { reportError(error); return nil }
                guard let running = NSRunningApplication(processIdentifier: pid) else { return nil }
                return systemFocusOwnerApplication(running)?.processIdentifier
            }, workspaceFrontmostPID: { NSWorkspace.shared.frontmostApplication?.processIdentifier })
    }
    return systemFocusedElementOwnerPID(element: focused, transaction: transaction,
        missingElementFallback: fallback, reportError: reportError)
}

// Readable payload of the ViewBridge-specific native result. Native enum tag
// encoding is not a wire protocol and remains separate from these identities.
struct ViewBridgeFocusIdentities {
    let ownerPID: Int32
    let actualFocusedPID: Int32?
}

func systemViewBridgeFocusIdentities(
    pid: Int32, transaction: UIElementTransactionCache?,
    activity: SyntheticFocusActivity = .shared,
    reportError: (Error) -> Void
) -> ViewBridgeFocusIdentities {
    let application = UIElement(systemElement: AXUIElementCreateApplication(pid), transaction: transaction)
    let owner = application.resolveViewBridgePrimaryFocusPID(transaction: transaction, activity: activity,
        now: { ProcessInfo.processInfo.systemUptime }, sleepMicroseconds: { _ = usleep($0) },
        resolveElement: {
            systemCommonFocusOwnerPID(application: application, element: $0, skipApplicationOwner: true,
                transaction: transaction, reportError: reportError)
        }, reportError: reportError)
    let actual = viewBridgeActualFocusPID(application: application, transaction: transaction, reportError: reportError)
    return ViewBridgeFocusIdentities(ownerPID: owner, actualFocusedPID: actual)
}
