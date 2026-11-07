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

// Initial system-state owner at 0x10074b920..0x10074b9a8. Workspace
// fallback is an ordinary identity; do not re-run special owner resolution.
func initialFocusStealOwnerIdentity(queryKeyFocusPID: () -> Int32?,
    resolveOwner: (Int32) -> KeyFocusOwnerIdentity,
    workspaceFrontmostPID: () -> Int32?) -> KeyFocusOwnerIdentity {
    if let pid = queryKeyFocusPID() { return resolveOwner(pid) }
    return .ordinary(pid: workspaceFrontmostPID() ?? 0)
}

func systemInitialFocusStealOwnerIdentity(transaction: UIElementTransactionCache?,
    reportRegistryFailure: (Int32, Int32) -> Void,
    reportError: (Error) -> Void) -> KeyFocusOwnerIdentity {
    initialFocusStealOwnerIdentity(
        queryKeyFocusPID: { systemRegistryKeyFocusPID(reportFailure: reportRegistryFailure) },
        resolveOwner: { systemKeyFocusOwnerIdentity(pid: $0, transaction: transaction, reportError: reportError) },
        workspaceFrontmostPID: { NSWorkspace.shared.frontmostApplication?.processIdentifier })
}

// Semantic history at state offsets 0/0xc; preserve complete payloads, not
// only owner PIDs. Initial previous storage is an uninitialized sentinel in
// the binary, represented by nil here without claiming native tag encoding.
// Enclosing system-state owner serializes mutations.
struct FocusStealOwnershipHistory {
    private(set) var current: KeyFocusOwnerIdentity
    private(set) var previous: KeyFocusOwnerIdentity?
    init(current: KeyFocusOwnerIdentity) { self.current = current; previous = nil }
    // 0x10074d23c..0x10074d270 always copies old to previous then writes new,
    // even if logical owner PID stayed equal.
    mutating func record(_ owner: KeyFocusOwnerIdentity) {
        previous = current
        current = owner
    }
}

// 0x10074e288..0x10074e3ec: ViewBridge compensation eligibility.
// This selects the later focused-element inspection; it is not itself a
// release/activation operation. Registration is read before PID comparison.
func viewBridgeFocusTransitionNeedsInspection(previous: KeyFocusOwnerIdentity,
    current: KeyFocusOwnerIdentity, routeObservation: FocusStealRouteObservation,
    isRegistered: (Int32) -> Bool) -> Bool {
    switch routeObservation {
    case .firstInterceptedFocus, .repeatedInterceptedFocus: return false
    case .noRoute, .recipientFocus, .cleared: break
    }
    guard case .viewBridge = previous, case .viewBridge = current else { return false }
    let registered = isRegistered(current.ownerPID)
    return registered && current.ownerPID != previous.ownerPID
}
