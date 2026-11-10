import ApplicationServices

// Owner fields from ComputerUseCursor.setCorrespondingApplication(pid:),
// 0x100093cd4. Keep association on the cursor owner, not on its NSWindow.
@MainActor
protocol CursorCorrespondingApplicationStorage: AnyObject {
    var correspondingApplicationPID: pid_t? { get set }
    var window: ComputerUseCursorWindow { get }
}

@MainActor
extension CursorCorrespondingApplicationStorage {
    func setCorrespondingApplication(pid: pid_t) {
        correspondingApplicationPID = pid
        // The source retains the destination before constructing application
        // state, then reads the current window again for the monitor's weak link.
        let destination = window
        let application = UIElement(element: AXUIElementCreateApplication(pid))
        let monitor = CursorAppMonitor(application: application, processID: pid, cursorWindow: window)
        // A failed constructor clears the previous monitor as well. Repeated
        // assignments are not deduplicated merely because their PID is equal.
        destination.appMonitor = monitor
    }
}
