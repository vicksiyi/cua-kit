import AppKit
import ApplicationServices

// Semantic result preserves identities needed by the preventer. This is not
// the native enum's packed representation or an external protocol encoding.
enum KeyFocusOwnerIdentity {
    case ordinary(pid: Int32)
    case restricted(ownerPID: Int32, sourcePID: Int32)
    case viewBridge(ViewBridgeFocusIdentities)
    var ownerPID: Int32 {
        switch self {
        case .ordinary(let pid): return pid
        case .restricted(let owner, _): return owner
        case .viewBridge(let identities): return identities.ownerPID
        }
    }
}

func systemKeyFocusOwnerIdentity(
    pid: Int32, transaction: UIElementTransactionCache?,
    activity: SyntheticFocusActivity = .shared, reportError: (Error) -> Void
) -> KeyFocusOwnerIdentity {
    if viewBridgeAuxiliaryFocusPID() == pid {
        return .viewBridge(systemViewBridgeFocusIdentities(pid: pid, transaction: transaction,
            activity: activity, reportError: reportError))
    }
    guard NSRunningApplication(processIdentifier: pid)?.activationPolicy == .prohibited else {
        return .ordinary(pid: pid)
    }
    let application = UIElement(systemElement: AXUIElementCreateApplication(pid), transaction: transaction)
    let owner = systemCommonFocusOwnerPID(application: application, element: nil,
        skipApplicationOwner: false, transaction: transaction, reportError: reportError)
    return .restricted(ownerPID: owner, sourcePID: pid)
}

func systemInitialSyntheticFocusState(
    application: NSRunningApplication, transaction: UIElementTransactionCache?,
    preventerFocusPID: () -> Int32?, reportRegistryFailure: (Int32, Int32) -> Void,
    reportError: (Error) -> Void
) -> SyntheticApplicationFocusState {
    initialSyntheticFocusState(targetIsActive: application.isActive, targetPID: application.processIdentifier,
        preventerFocusPID: preventerFocusPID,
        queryKeyFocusPID: { systemRegistryKeyFocusPID(reportFailure: reportRegistryFailure) },
        resolveFocusOwnerPID: { systemKeyFocusOwnerIdentity(pid: $0, transaction: transaction, reportError: reportError).ownerPID },
        workspaceFrontmostPID: { NSWorkspace.shared.frontmostApplication?.processIdentifier })
}
