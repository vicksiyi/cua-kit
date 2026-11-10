import ApplicationServices
import Foundation
import os

func makeTreeInvalidationObserver<Observer>(processID: () throws -> Int32,
    create: (Int32) throws -> Observer,
    register: (Observer, AXNotification) throws -> Void,
    start: (Observer, QualityOfService) -> Void
) -> Observer? {
    do {
        let observer = try create(processID())
        try register(observer, AXNotification("AXLayoutChanged"))
        try register(observer, .uiElementDestroyed)
        start(observer, .utility)
        return observer
    } catch { return nil }
}

final class UIElementTreeInvalidationMonitor {
    struct State {
        var layoutChanged = false
        var destroyedElements = Set<AXUIElement>()
    }
    let state = OSAllocatedUnfairLock(initialState: State())
    private(set) var observer: AXNotificationObserver?

    // Native0x10076ae48: failure leaves the monitor/state alive with nil
    // observer; subscription errors are not ignored individually or retried.
    init(app: ApplicationUIElement, processID: ((ApplicationUIElement) throws -> Int32)? = nil) {
        let state = self.state
        observer = makeTreeInvalidationObserver(processID: { try processID?(app) ?? app.axElement.pid },
            create: { pid in
                try AXNotificationObserver(processID: pid) { event in
                    recordTreeInvalidation(event.notification, element: event.element, state: state)
                }
            }, register: { try $0.register($1, ignoringErrors: [], for: app.axElement) },
            start: { $0.startMonitoring(qos: $1) })
    }
    deinit { observer?.stopMonitoring() }
}

// Native event body0x10076b1e0. Capture the state lock rather than monitor
// owner, so observer callbacks cannot form an owner/observer retain cycle.
func recordTreeInvalidation(_ notification: AXNotification, element: AXUIElement,
    state: OSAllocatedUnfairLock<UIElementTreeInvalidationMonitor.State>) {
    if notification == AXNotification("AXLayoutChanged") {
        state.withLock { $0.layoutChanged = true }
    } else if notification == .uiElementDestroyed {
        state.withLock { _ = $0.destroyedElements.insert(element) }
    }
}
