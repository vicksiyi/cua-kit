import AppKit
import ApplicationServices
import os

// Source static constructor 0x10009c188 and deinit 0x10009ca48. Dynamic
// metadata slots are deleted in this build; these statically called bodies exist.
@MainActor
final class CursorAppMonitor: CursorAppMonitorEventStorage {
    let application: UIElement
    private(set) var axObserver: AXNotificationObserver?
    let runningApplication: NSRunningApplication
    weak var cursorWindow: (any CursorAppMonitorWindow)?
    private(set) var activeObserver: NSKeyValueObservation?
    var appIsActive = false
    var menusOpen = 0

    init?(application: UIElement, processID: pid_t, cursorWindow: any CursorAppMonitorWindow) {
        guard let runningApplication = NSRunningApplication(processIdentifier: processID) else { return nil }
        self.application = application
        self.runningApplication = runningApplication
        self.cursorWindow = cursorWindow
        // Constructor ignores AX observer creation/registration errors and still
        // installs KVO. No unsupported-notification errors are exempted.
        axObserver = try? AXNotificationObserver(monitoringNotifications: [
            .focusedWindowChanged, .menuOpened, .menuClosed
        ], ignoringErrors: [], processID: processID, element: application.axElement,
            qos: .userInitiated) { [weak self] event in
                // Native weak-loads before creating its unstructured task, so an
                // accepted callback retains the monitor through the actor hop.
                guard let self else { return }
                let notification = event.notification
                Task { @MainActor in
                    self.handleCursorApplicationNotification(notification) {
                        guard let window = self.application.primaryWindowValue(reportError: { error in
                            Logger(subsystem: "core.cua", category: "Accessibility")
                                .error("AppMonitor primary window read failed: \(String(describing: error))")
                        }) else { return nil }
                        return try window.axElement.windowID
                    }
                }
            }
        activeObserver = runningApplication.observe(\.isActive, options: [.new]) { [weak self] _, change in
            guard let self else { return }
            let active = change.newValue ?? false
            Task { @MainActor in self.applyApplicationActiveChange(active) }
        }
        // Native uses an explicit read after registering KVO, not .initial.
        applyApplicationActiveChange(runningApplication.isActive)
    }

    deinit {
        axObserver?.stopMonitoring()
        activeObserver?.invalidate()
    }
}
