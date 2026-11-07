import AppKit

// SystemFrontmostApplicationTracker's excludeCurrentApp=false branch used by
// SyntheticAppFocusEnforcer. The separate exclusion/fallback branch is pending.
final class InclusiveFrontmostApplicationTracker {
    typealias Store = FrontmostApplicationObservationStore<NSRunningApplication>
    let observations = Store()
    private let center: NotificationCenter
    private var registration: NSObjectProtocol?
    init(center: NotificationCenter = NSWorkspace.shared.notificationCenter,
         initialApplication: () -> NSRunningApplication? = { NSWorkspace.shared.menuBarOwningApplication }) {
        self.center = center
        if let application = initialApplication() { observations.observe(application) }
        registration = center.addObserver(forName: NSWorkspace.didActivateApplicationNotification,
            object: nil, queue: nil) { [weak self] notification in
                guard let application = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
                self?.observations.observe(application)
            }
    }
    deinit { if let registration { center.removeObserver(registration) } }
}
