import ApplicationServices

// Combines the recovered callback behavior with concrete native boundaries.
// The owning controller supplies serialized access and resource lookups. This
// object neither creates a focus enforcer nor owns/starts an AX observer.
final class AppControllerAXEventHandler<FocusedMenuBarItem> {
    let windows: AppControllerWindows<FocusedMenuBarItem>
    private let application: AXUIElement
    private let bundleIdentifier: String
    private let observer: () -> AXNotificationObserver?
    private let focusEnforcer: () -> SyntheticAppFocusEnforcer?

    init(application: AXUIElement, bundleIdentifier: String,
        windows: AppControllerWindows<FocusedMenuBarItem>,
        observer: @escaping () -> AXNotificationObserver?,
        focusEnforcer: @escaping () -> SyntheticAppFocusEnforcer?) {
        self.application = application; self.bundleIdentifier = bundleIdentifier
        self.windows = windows; self.observer = observer; self.focusEnforcer = focusEnforcer
    }
    func handle(_ event: AXNotificationObserver.NotificationEvent) {
        handle(event.notification, element: event.element)
    }
    func handle(_ notification: AXNotification, element: AXUIElement) {
        dispatchAppControllerWindowEvent(notification, element: element,
            registerWindow: windows.registerWindow, registerSheet: windows.registerSheet,
            clearApplicationAttention: { clearNativeAppControllerAttention(self.application) },
            windowCreatedFocusHandling: { created in
                guard self.bundleIdentifier == "com.apple.controlcenter" else { return }
                let registration: (() throws -> Void)? = self.observer().map { observer in
                    { try observer.register(.uiElementDestroyed, for: created) }
                }
                prepareAppControllerWindowCreatedFocus(bundleIdentifier: self.bundleIdentifier,
                    registerDestroyed: registration, actualPID: { try created.actualPID },
                    startSuppressingMenuDismissal: { self.focusEnforcer()?.startSuppressingMenuDismissalEvents(menuPID: $0) })
            }, removeDestroyedSubscription: { destroyed in
                try self.observer()?.remove(.uiElementDestroyed, for: destroyed)
            }, menuOpened: { menu in
                self.windows.openMenu(menu)
                let menuPID = try? menu.actualPID
                self.focusEnforcer()?.startSuppressingMenuDismissalEvents(menuPID: menuPID)
            }, menuClosed: windows.closeMenu,
            stopSuppressingMenuDismissal: { self.focusEnforcer()?.stopSuppressingMenuDismissalEvents() },
            republishObservedWindowIDs: windows.republishObservedWindowIDs)
    }
}
