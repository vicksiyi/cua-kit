import ApplicationServices

// Native controller resource owner. AX monitoring starts during construction;
// ordering starts only on activation, after the caller's AX enablement step.
// Dictionary operations and handle delivery require owner serialization. This
// class does not assert that Target/MainActor integration is already complete.
final class AppControllerWindowObservation<FocusedMenuBarItem> {
    let windows: AppControllerWindows<FocusedMenuBarItem>
    let orderingObserver: NativeWindowOrderingObserver
    private(set) var windowObserver: AXNotificationObserver?
    private var eventHandler: AppControllerAXEventHandler<FocusedMenuBarItem>?

    init(application: AXUIElement, processID: Int32, bundleIdentifier: String,
        focusEnforcer: @escaping () -> SyntheticAppFocusEnforcer?,
        reportError: @escaping (Error) -> Void,
        deliverEvent: @escaping (@escaping () -> Void) -> Void = { $0() },
        initializeWindows: ((AppControllerWindows<FocusedMenuBarItem>) -> Void)? = nil,
        makeObserver: ((@escaping (AXNotificationObserver.NotificationEvent) -> Void) throws -> AXNotificationObserver)? = nil) throws {
        let ordering = NativeWindowOrderingObserver(observedWindowIDs: [], reportError: reportError)
        orderingObserver = ordering
        windows = AppControllerWindows(observedWindowIDsChanged: { ordering.observedWindowIDs = $0 },
            menuDidOpen: { ordering.menuDidOpen() }, menuDidClose: { ordering.menuDidClose() })
        eventHandler = AppControllerAXEventHandler(application: application, bundleIdentifier: bundleIdentifier,
            windows: windows, observer: { [weak self] in self?.windowObserver }, focusEnforcer: focusEnforcer)
        if let initializeWindows { initializeWindows(windows) }
        else { windows.initialize(application: UIElement(element: application), reportError: reportError) }
        let callback: (AXNotificationObserver.NotificationEvent) -> Void = { [weak self] event in
            // Default is the source synchronous AX-thread delivery. An adapter
            // may provide its owner's serial executor; queued work must not
            // retain the controller while waiting for that executor.
            deliverEvent { [weak self] in self?.eventHandler?.handle(event) }
        }
        if let makeObserver { windowObserver = try makeObserver(callback) }
        else {
            windowObserver = try AXNotificationObserver(monitoringNotifications: AppControllerAXNotifications.root,
                processID: processID, element: application, qos: AppControllerAXNotifications.qualityOfService,
                handler: callback)
        }
    }
    func activateOrdering() { orderingObserver.start() }
    func deactivateOrdering() { orderingObserver.stop() }
    deinit {
        // Ordering can also be retained by window-state callbacks; stop it
        // explicitly before releasing native AX monitoring resources.
        orderingObserver.stop()
        windowObserver?.stopMonitoring()
    }
}
