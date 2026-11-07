// State transitions extracted from SyntheticAppFocusEnforcer.
// This is not the event-tap/observer lifecycle implementation.
struct SyntheticApplicationFocusState: Equatable {
    var applicationBelievesItIsActive: Bool
    var applicationBelievesItHasFocus: Bool
    var applicationIsActive: Bool

    // 0x100740f70: actual foreground state does not select this branch.
    // Window activation construction is delegated to the caller, preserving
    // lazy window reads: a focus-only restoration must not query window data.
    mutating func enforceActiveState(
        sendKeyFocusReturned: () throws -> Void,
        sendAppActivated: () throws -> Void
    ) throws {
        if applicationBelievesItHasFocus { return }
        if applicationBelievesItIsActive {
            try sendKeyFocusReturned()
            // 0x10074ad34 -> 0x100746338 writes byte 1 only.
            applicationBelievesItHasFocus = true
        } else {
            try sendAppActivated()
            // 0x100746344 writes 0x0101, preserving actual active state.
            applicationBelievesItIsActive = true
            applicationBelievesItHasFocus = true
        }
    }

    mutating func deactivateFocusEnforcer(sendDeactivation: () throws -> Void) throws {
        // Source checks bytes 0 and 2 before sending. Real foreground apps are
        // left alone, even when the synthetic-focus belief differs.
        guard applicationBelievesItIsActive && !applicationIsActive else { return }
        try sendDeactivation()
        // 0x100746350 clears only the first two bytes; do not clear actual state.
        applicationBelievesItIsActive = false
        applicationBelievesItHasFocus = false
    }
}


// Mutation wrapper 0x100746270: reconcile click monitoring after a successful
// mutation. Focus-only changes do not restart monitoring.
enum SyntheticFocusClickMonitoringChange: Equatable { case unchanged, start, stop }
func syntheticFocusClickMonitoringChange(before: SyntheticApplicationFocusState,
                                         after: SyntheticApplicationFocusState) -> SyntheticFocusClickMonitoringChange {
    let wasSyntheticActive = before.applicationBelievesItIsActive && !before.applicationIsActive
    if after.applicationIsActive { return wasSyntheticActive ? .stop : .unchanged }
    guard wasSyntheticActive != after.applicationBelievesItIsActive else { return .unchanged }
    return after.applicationBelievesItIsActive ? .start : .stop
}

extension SyntheticApplicationFocusState {
    // 0x10074a1e0 seeds belief/actual active together; key focus is independent.
    init(applicationIsActive: Bool, applicationHasKeyFocus: Bool) {
        self.init(applicationBelievesItIsActive: applicationIsActive,
                  applicationBelievesItHasFocus: applicationHasKeyFocus,
                  applicationIsActive: applicationIsActive)
    }
    // Accepted activation events write both belief bytes (0x10074ab70).
    mutating func observeApplicationActivation(_ active: Bool) {
        applicationBelievesItIsActive = active
        applicationBelievesItHasFocus = active
    }
    // Frontmost tracker updates actual-active only (0x10074ab24).
    mutating func observeFrontmostPID(_ frontmostPID: Int32?, targetPID: Int32) {
        applicationIsActive = frontmostPID == targetPID
    }
}
