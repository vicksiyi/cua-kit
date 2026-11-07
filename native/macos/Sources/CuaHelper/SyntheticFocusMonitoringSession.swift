import Foundation
import CoreGraphics

// Owns the source enforcer's target tap and optional click tap. Frontmost
// tracking and focus-steal prevention are supplied by the enclosing controller.
final class SyntheticFocusMonitoringSession {
    private final class ClickSlot {
        var monitor: SyntheticFocusClickMonitor?
        let create: () -> SyntheticFocusClickMonitor
        init(create: @escaping () -> SyntheticFocusClickMonitor) { self.create = create }
        func start() { monitor = create() }
        func stop() { monitor = nil }
    }
    let target: SyntheticFocusTargetMonitor
    private let clickSlot: ClickSlot
    init(pid: Int32, helperPID: Int32 = ProcessInfo.processInfo.processIdentifier,
         initialState: SyntheticApplicationFocusState,
         tapDriver: EventTap.Driver = .system,
         eventWindowID: @escaping (CGEvent) -> UInt32? = syntheticFocusClickWindowID,
         windowOwnerPID: @escaping (UInt32) -> Int32? = syntheticFocusWindowOwnerPID,
         activateApplication: @escaping (Int32) -> Void = activateSyntheticFocusClickApplication) {
        let slot = ClickSlot {
            SyntheticFocusClickMonitor(helperPID: helperPID, targetPID: pid,
                eventWindowID: eventWindowID, windowOwnerPID: windowOwnerPID,
                activateApplication: activateApplication, driver: tapDriver)
        }
        clickSlot = slot
        // Source init applies its initial state through the mutation wrapper,
        // after constructing state storage with all three bytes zero.
        target = SyntheticFocusTargetMonitor(pid: pid,
            initialState: initialState,
            startClickMonitoring: { slot.start() }, stopClickMonitoring: { slot.stop() }, driver: tapDriver)
    }
    func enforceActiveState(for window: SyntheticActivationWindow?,
                            send: (SynthesizedEvent) throws -> Void) throws {
        try target.state.mutate { try $0.enforceActiveState(for: window, send: send) }
    }
    func deactivateFocusEnforcer(send: (SynthesizedEvent) throws -> Void) throws {
        try target.state.mutate { state in
            try state.deactivateFocusEnforcer { try send(SynthesizedEvent.notifyAppDeactivated()) }
        }
    }
    deinit { clickSlot.stop() }
}
