// State transition extracted from SyntheticAppFocusEnforcer.deactivateFocusEnforcer
// (0x100745848). This is not the event-tap/observer lifecycle implementation.
struct SyntheticApplicationFocusState: Equatable {
    var applicationBelievesItIsActive: Bool
    var applicationBelievesItHasFocus: Bool
    var applicationIsActive: Bool

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
