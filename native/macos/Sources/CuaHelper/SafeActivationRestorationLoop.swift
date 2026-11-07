import Foundation

// Errors correspond to the two native enforcer error tags and PollError.
// Public error serialization is supplied by the enclosing enforcer adapter.
enum SafeActivationRestoreError: Error, Equatable {
    case activationFailed
    case foregroundApplicationChanged
    case timedOut
}

struct SafeActivationRestorationDriver {
    var now: () -> Double = { ProcessInfo.processInfo.systemUptime }
    var frontmostPID: () -> Int32?
    var activateSavedApplication: () -> Bool
    // Native AX read treats missing/failed reads as false, reporting errors.
    var targetBelievesItIsFrontmost: () -> Bool
    // Returns true when a target window precedes the saved window at the same
    // level. Raises the saved AX window when available; propagates raise errors.
    var restoreSavedWindowIfObscured: () throws -> Bool
    var checkCancellation: () throws -> Void = { try Task.checkCancellation() }
    var sleep: (Duration) async throws -> Void = { try await Task.sleep(for: $0) }
}

// Other-foreground-app restoration branch, 0x100741f30..0x100742b24.
// Run inside withSafeActivationRestoration so original enforcement errors win
// and all paths release taps / restore WindowServer updates.
func restoreSafeActivationForeground(
    targetPID: Int32, savedPID: Int32, enforcementFailed: Bool,
    observations: SafeActivationObservationStore,
    driver: SafeActivationRestorationDriver
) async throws {
    observations.access { $0.markRestorationActivity(time: driver.now()) }
    let started = driver.now()
    var lastActivation = 0.0
    var activatedSavedApplication = false
    try driver.checkCancellation()
    while true {
        let now = driver.now()
        let elapsed = now - started
        let currentPID = driver.frontmostPID()
        if currentPID == targetPID {
            if now - lastActivation >= SafeActivationTiming.reactivationInterval {
                observations.access { $0.beginForegroundRestoration(time: now) }
                guard driver.activateSavedApplication() else {
                    throw SafeActivationRestoreError.activationFailed
                }
                lastActivation = now
                activatedSavedApplication = true
            }
            if !(elapsed < SafeActivationTiming.timeout) { throw SafeActivationRestoreError.timedOut }
        } else {
            guard currentPID == savedPID else {
                throw SafeActivationRestoreError.foregroundApplicationChanged
            }
            // A saved enforcement error skips the AX read, but still restores
            // window order and waits for the appropriate notification/quiet gate.
            let targetIsFrontmost = enforcementFailed || driver.targetBelievesItIsFrontmost()
            if try driver.restoreSavedWindowIfObscured() {
                observations.access { $0.markRestorationActivity(time: now) }
                if elapsed < 1 {
                    try await driver.sleep(SafeActivationTiming.pollInterval)
                    try driver.checkCancellation()
                    continue
                }
            }
            if targetIsFrontmost || elapsed >= 1 {
                // Native source reads frontmost again after AX/window operations.
                let savedStillFrontmost = driver.frontmostPID() == savedPID
                let state = observations.snapshot
                switch safeActivationRestorationDecision(
                    savedApplicationIsFrontmost: savedStillFrontmost,
                    requiresPairedNotifications: activatedSavedApplication,
                    requiresQuietPeriod: enforcementFailed || activatedSavedApplication || state.transitionFlags & 1 != 0,
                    observation: state, elapsed: elapsed, now: driver.now) {
                case .complete: return
                case .timedOut: throw SafeActivationRestoreError.timedOut
                case .pollAgain: break
                }
            } else if !(elapsed < SafeActivationTiming.timeout) {
                throw SafeActivationRestoreError.timedOut
            }
        }
        try await driver.sleep(SafeActivationTiming.pollInterval)
        try driver.checkCancellation()
    }
}
