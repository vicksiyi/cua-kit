import ApplicationServices
import Foundation

// Native AXNotificationObserver, 0x1006ec098..0x1006ed838.
final class AXNotificationObserver {
    struct NotificationEvent {
        let observer: AXObserver
        let element: AXUIElement
        let notification: AXNotification
        let info: [String: AnyObject]?
    }
    enum InitializationError: Error { case missingObserver }
    let pid: pid_t
    let axObserver: AXObserver
    let onNotificationReceived: (NotificationEvent) -> Void
    private let installedTargets = AXNotificationRegistrationTargets<AXUIElement>()
    private lazy var callbackContext = AXNotificationCallbackContext(axObserver: axObserver, owner: self)
    private var monitoringTask: RunLoopTask?
    private var observerRunLoopSource: CFRunLoopSource?

    init(processID: pid_t, handler: @escaping (NotificationEvent) -> Void) throws {
        var observer: AXObserver?
        let error = AXObserverCreateWithInfoCallback(processID, { observer, element, notification, info, refcon in
            guard let refcon else { return }
            let context = Unmanaged<AXNotificationCallbackContext<AXObserver, AXNotificationObserver>>
                .fromOpaque(refcon).takeUnretainedValue()
            let dictionary = bridgeAXNotificationInfo(info)
            AXNotificationCallbackContext.deliver(context: context, info: dictionary) { owner, dictionary in
                owner.onNotificationReceived(NotificationEvent(observer: observer, element: element,
                    notification: AXNotification(notification), info: dictionary))
            }
        }, &observer)
        guard error == .success else { throw UIElementError.axError(error) }
        guard let observer else { throw InitializationError.missingObserver }
        pid = processID
        axObserver = observer
        onNotificationReceived = handler
    }

    func register(_ notification: AXNotification, ignoringErrors: [AXError] = [],
        for element: AXUIElement) throws {
        try installedTargets.register(notification, ignoringErrors: ignoringErrors, for: element) {
            AXObserverAddNotification(axObserver, element, notification.name,
                Unmanaged.passUnretained(callbackContext).toOpaque())
        }
    }
    func register(_ notifications: [AXNotification], ignoringErrors: [AXError] = [],
        for element: AXUIElement) throws {
        for notification in notifications { try register(notification, ignoringErrors: ignoringErrors, for: element) }
    }
    func remove(_ notification: AXNotification, for element: AXUIElement) throws {
        try installedTargets.remove(notification, for: element) {
            AXObserverRemoveNotification(axObserver, element, notification.name)
        }
    }
    func remove(_ notification: AXNotification) throws {
        try installedTargets.remove(notification) { notification, element in
            AXObserverRemoveNotification(self.axObserver, element, notification.name)
        }
    }
    func remove(_ notifications: [AXNotification]) throws {
        for notification in notifications { try remove(notification) }
    }
    func remove(_ notifications: [AXNotification], for element: AXUIElement) throws {
        for notification in notifications { try remove(notification, for: element) }
    }

    func startMonitoring(qos: QualityOfService) {
        guard monitoringTask == nil else { return }
        let source = AXObserverGetRunLoopSource(axObserver)
        monitoringTask = RunLoopTask(name: "AXNotificationObserver for pid \(pid)",
            qualityOfService: qos, contextObject: callbackContext) { runLoop in
                // Original configuration waits for prior main-thread work.
                DispatchQueue.main.sync {}
                CFRunLoopAddSource(runLoop, source, .defaultMode)
            }
        observerRunLoopSource = source
    }
    func stopMonitoring() {
        guard let task = monitoringTask else { return }
        if let runLoop = task.currentRunLoop, let source = observerRunLoopSource {
            CFRunLoopRemoveSource(runLoop, source, .defaultMode)
        }
        observerRunLoopSource = nil
        monitoringTask = nil
    }
    deinit { stopMonitoring() }
}

// Source uses Dictionary<String, AnyObject> conditional Objective-C bridging,
// not arbitrary AnyHashable keys (0x1006ed6cc, imported Foundation bridge).
func bridgeAXNotificationInfo(_ info: CFDictionary?) -> [String: AnyObject]? {
    guard let info else { return nil }
    return info as NSDictionary as? [String: AnyObject]
}
