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
    private var frontmostTracker: InclusiveFrontmostApplicationTracker?
    private var frontmostObserver: InclusiveFrontmostApplicationTracker.Store.Observer?
    private let pid: Int32
    private let helperPID: Int32
    init(pid: Int32, helperPID: Int32 = ProcessInfo.processInfo.processIdentifier,
         initialState: SyntheticApplicationFocusState,
         tapDriver: EventTap.Driver = .system,
         eventWindowID: @escaping (CGEvent) -> UInt32? = syntheticFocusClickWindowID,
         windowOwnerPID: @escaping (UInt32) -> Int32? = syntheticFocusWindowOwnerPID,
         activateApplication: @escaping (Int32) -> Void = activateSyntheticFocusClickApplication) {
        self.pid = pid; self.helperPID = helperPID
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
    func trackFrontmostApplications(using tracker: InclusiveFrontmostApplicationTracker) {
        if let previous = frontmostTracker, let observer = frontmostObserver {
            previous.observations.removeObserver(observer)
        }
        frontmostTracker = tracker
        let target = self.target, pid = self.pid
        frontmostObserver = tracker.observations.addObserver { [weak target] application in
            target?.observeFrontmostPID(application.processIdentifier, targetPID: pid)
        }
    }
    func synthesizedActionWasPerformed(activity: SyntheticFocusActivity = .shared,
                                       now: () -> Double = { ProcessInfo.processInfo.systemUptime }) {
        activity.record(pid: pid, time: now())
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
    // Only the other-foreground-app branch. The caller first selects this
    // branch and captures saved application/window state as in the source.
    func safelyEnforceWhileRestoring(savedPID: Int32, window: SyntheticActivationWindow?,
                                    send: (SynthesizedEvent) throws -> Void,
                                    restoration: SafeActivationRestorationDriver,
                                    tapDriver: EventTap.Driver = .system,
                                    updates: WindowUpdateDriver = .system) async throws {
        let filter = target.activationFilter
        let resources = SafeActivationNativeResources(savedPID: { savedPID }, targetPID: pid,
            helperPID: helperPID, setTargetObserver: { filter.setSuppression($0) },
            clock: restoration.now, tapDriver: tapDriver, updates: updates)
        try await resources.enforceAndRestore(enforce: {
            try self.enforceActiveState(for: window, send: send)
        }, driver: restoration)
    }
    deinit {
        if let frontmostTracker, let frontmostObserver {
            frontmostTracker.observations.removeObserver(frontmostObserver)
        }
        clickSlot.stop()
    }
}
