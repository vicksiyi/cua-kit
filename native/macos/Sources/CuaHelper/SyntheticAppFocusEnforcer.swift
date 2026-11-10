import AccessibilitySupport
import Foundation
import AppKit
import CoreGraphics
import ApplicationServices

// Enclosing initialization/teardown at 0x100740624 / 0x100740e14.
// Safe-activation branch orchestration is restored separately from lifecycle.
final class SyntheticAppFocusEnforcer {
    private final class WeakState: @unchecked Sendable {
        weak var value: SyntheticFocusStateStore?
        init(_ value: SyntheticFocusStateStore) { self.value = value }
    }
    let pid: Int32
    private let prevention: FocusStealPreventerLifecycle
    private let session: SyntheticFocusMonitoringSession

    init(pid: Int32, prevention: FocusStealPreventerLifecycle,
         makeTracker: () -> InclusiveFrontmostApplicationTracker,
         targetIsActive: @escaping () -> Bool,
         tapDriver: EventTap.Driver = .system) {
        self.pid = pid; self.prevention = prevention
        // Source creates the inclusive tracker first, registers prevention
        // before reading initial active/key-focus state, starts the target tap
        // after that mutation, and attaches the observer last (no replay).
        let tracker = makeTracker()
        session = SyntheticFocusMonitoringSession(pid: pid,
            initialState: SyntheticApplicationFocusState(applicationIsActive: false, applicationHasKeyFocus: false),
            tapDriver: tapDriver, initializeState: { state in
                let weakState = WeakState(state)
                prevention.startPreventingFocusStealing(for: pid,
                    targetLostFocusHandler: { weakState.value?.mutate { $0.applicationBelievesItHasFocus = false } },
                    targetGainedFocusHandler: { weakState.value?.mutate { $0.applicationBelievesItHasFocus = true } })
                let active = targetIsActive()
                return { SyntheticApplicationFocusState(applicationIsActive: active,
                    applicationHasKeyFocus: prevention.isAppCurrentlyFocused(pid)) }
            })
        session.trackFrontmostApplications(using: tracker)
    }
    var state: SyntheticApplicationFocusState { session.target.state.snapshot }
    func enforceActiveState(for window: SyntheticActivationWindow?, send: (SynthesizedEvent) throws -> Void) throws {
        try session.enforceActiveState(for: window, send: send)
    }
    func safelyEnforceActiveState(for window: SyntheticActivationWindow?,
        send: (SynthesizedEvent) throws -> Void,
        frontmostApplication: () -> NSRunningApplication? = { NSWorkspace.shared.frontmostApplication },
        waitAfterDirectEnforcement: () async -> Void,
        makeRestorationDriver: (NSRunningApplication) throws -> SafeActivationRestorationDriver,
        tapDriver: EventTap.Driver = .system, updates: WindowUpdateDriver = .system) async throws {
        try await safelyEnforceSyntheticFocus(targetPID: pid, frontmostApplication: frontmostApplication,
            processIdentifier: { $0.processIdentifier }, enforce: {
                try self.session.enforceActiveState(for: window, send: send)
            }, waitAfterDirectEnforcement: waitAfterDirectEnforcement, restoreOtherApplication: { saved in
                let restoration = try makeRestorationDriver(saved)
                try await self.session.safelyEnforceWhileRestoring(savedPID: saved.processIdentifier,
                    window: window, send: send, restoration: restoration, tapDriver: tapDriver, updates: updates)
            })
    }
    func safelyEnforceActiveState(for window: SyntheticActivationWindow?,
        send: (SynthesizedEvent) throws -> Void, reportError: @escaping (Error) -> Void) async throws {
        try await safelyEnforceActiveState(for: window, send: send, waitAfterDirectEnforcement: {
            let application = UIElement(systemElement: AXUIElementCreateApplication(self.pid),
                transaction: UIElementTreeTransaction.current?.cache)
            await application.waitUntilAppBelievesItIsFrontmost(timeout: 0.25, reportError: reportError)
        }, makeRestorationDriver: { saved in
            let transaction = UIElementTreeTransaction.current?.cache
            let application = UIElement(systemElement: AXUIElementCreateApplication(systemResolvedProcessIdentifier(saved)),
                transaction: transaction)
            let savedWindow = systemSafeActivationSavedWindow(application: application,
                transaction: transaction, reportError: reportError)
            return systemSafeActivationRestorationDriver(savedApplication: saved, savedWindow: savedWindow,
                targetPID: self.pid, targetApplication: {
                    UIElement(systemElement: AXUIElementCreateApplication(self.pid), transaction: UIElementTreeTransaction.current?.cache)
                }, reportError: reportError)
        })
    }
    func deactivateFocusEnforcer(send: (SynthesizedEvent) throws -> Void) throws {
        try session.deactivateFocusEnforcer(send: send)
    }
    func synthesizedActionWasPerformed() { session.synthesizedActionWasPerformed() }
    func startSuppressingMenuDismissalEvents(menuPID: Int32?) {
        prevention.startSuppressingMenuDismissalEvents(for: pid, menuPID: menuPID)
    }
    func stopSuppressingMenuDismissalEvents() { prevention.stopSuppressingMenuDismissalEvents(for: pid) }
    deinit {
        session.stopTrackingFrontmostApplications()
        prevention.stopPreventingFocusStealing(for: pid)
    }
}
