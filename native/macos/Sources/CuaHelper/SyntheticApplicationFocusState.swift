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
