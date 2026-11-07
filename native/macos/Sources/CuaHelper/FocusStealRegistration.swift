import Foundation
import CoreGraphics

// DisallowedThiefProcess payload constructed at 0x1007504d4..0x1007504f0.
// Mutations of menu resources belong to the enclosing registration-list lock.
struct FocusStealRegistration {
    let pid: Int32
    let targetLostFocusHandler: (@Sendable () -> Void)?
    let targetGainedFocusHandler: (@Sendable () -> Void)?
    let keyboardMonitor: FocusStealKeyboardMonitor
    var mouseEventTaps: [EventTap]?
    var isMenuDismissalSuppressionEnabled: Bool

    init(pid: Int32, helperPID: Int32 = ProcessInfo.processInfo.processIdentifier,
         state: FocusStealKeyboardRoutingState,
         targetLostFocusHandler: (@Sendable () -> Void)?,
         targetGainedFocusHandler: (@Sendable () -> Void)?,
         driver: EventTap.Driver = .system,
         postKeyboard: @escaping (CGEvent, Int32) -> Void = { $0.postToPid($1) }) {
        self.pid = pid
        self.targetLostFocusHandler = targetLostFocusHandler
        self.targetGainedFocusHandler = targetGainedFocusHandler
        keyboardMonitor = FocusStealKeyboardMonitor(pid: pid, helperPID: helperPID, state: state, post: postKeyboard, driver: driver)
        mouseEventTaps = nil
        isMenuDismissalSuppressionEnabled = false
    }
    // Preserve the resource references in this particular record snapshot,
    // even when the live list later replaces/removes its menu taps or record.
    var callbackSnapshot: FocusStealRegistrationCallbacks {
        var resources: [AnyObject] = [keyboardMonitor]
        if let mouseEventTaps { resources.append(contentsOf: mouseEventTaps.map { $0 as AnyObject }) }
        return FocusStealRegistrationCallbacks(pid: pid, lost: targetLostFocusHandler,
            gained: targetGainedFocusHandler, retaining: resources)
    }
}
