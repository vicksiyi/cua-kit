import ApplicationServices

// 0x1006ecab8..0x1006eccec. The explicit ignore list takes precedence over
// success/already-registered bookkeeping, even if it contains .success.
func registerAXNotification(ignoringErrors: [AXError], addNotification: () -> AXError,
    recordTarget: () -> Void) throws {
    let error = addNotification()
    if ignoringErrors.contains(error) { return }
    guard error == .success || error == .notificationAlreadyRegistered else {
        throw UIElementError.axError(error)
    }
    recordTarget()
}

// The native observer keeps a plain notification -> Set<AXUIElement> map.
// Registration always calls AX first; this map is not a deduplication guard.
final class AXNotificationRegistrationTargets<Element: Hashable> {
    private(set) var targets: [AXNotification: Set<Element>] = [:]
    func register(_ notification: AXNotification, ignoringErrors: [AXError], for element: Element,
        addNotification: () -> AXError) throws {
        try registerAXNotification(ignoringErrors: ignoringErrors, addNotification: addNotification,
            recordTarget: { targets[notification, default: []].insert(element) })
    }

    func remove(_ notification: AXNotification, for element: Element,
        removeNotification: () -> AXError) throws {
        try removeAXNotification(removeNotification: removeNotification,
            removeTarget: { targets[notification, default: []].remove(element) })
    }
    func remove(_ notification: AXNotification,
        removeNotification: (AXNotification, Element) -> AXError) throws {
        guard let installed = targets[notification] else { return }
        // Snapshot the original Set before individual removals mutate it.
        for element in installed {
            try remove(notification, for: element, removeNotification: { removeNotification(notification, element) })
        }
    }
    func remove(notifications: [AXNotification], for element: Element,
        removeNotification: (AXNotification, Element) -> AXError) throws {
        for notification in notifications {
            try remove(notification, for: element, removeNotification: { removeNotification(notification, element) })
        }
    }
    func remove(notifications: [AXNotification],
        removeNotification: (AXNotification, Element) -> AXError) throws {
        for notification in notifications { try remove(notification, removeNotification: removeNotification) }
    }
}
