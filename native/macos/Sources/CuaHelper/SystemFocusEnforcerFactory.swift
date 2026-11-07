import AppKit
import os

private let focusLogger = Logger(subsystem: "core.cua", category: "SyntheticFocus")

extension FocusStealPreventerLifecycle {
    // One lazily materialized owner across the process, matching the native
    // singleton. Individual enforcers retain only their registration lifecycle.
    static let system = FocusStealPreventerLifecycle(makeInstance: { empty in
        SystemFocusStealPreventer(initialOwner: systemInitialFocusIdentity,
            viewBridgePID: viewBridgeAuxiliaryFocusPID,
            dependencies: .system(reportAXError: reportSystemFocusError,
                reportReleaseFailure: { failure in
                    focusLogger.error("Key focus release failed: \(String(describing: failure))")
                }), becameEmpty: empty)
    }, resolveInitialOwner: systemInitialFocusIdentity)
}

private func reportSystemFocusError(_ error: Error) {
    focusLogger.error("Focus AX read failed: \(String(describing: error))")
}
private func systemInitialFocusIdentity() -> KeyFocusOwnerIdentity {
    systemInitialFocusStealOwnerIdentity(transaction: UIElementTreeTransaction.current?.cache,
        reportRegistryFailure: { focus, pid in
            focusLogger.error("Focus registry query failed: focus=\(focus), pid=\(pid)")
        }, reportError: reportSystemFocusError)
}

extension SyntheticAppFocusEnforcer {
    static func system(pid: Int32) -> SyntheticAppFocusEnforcer {
        SyntheticAppFocusEnforcer(pid: pid, prevention: .system,
            makeTracker: { InclusiveFrontmostApplicationTracker() },
            targetIsActive: { NSRunningApplication(processIdentifier: pid)?.isActive ?? false })
    }
}
