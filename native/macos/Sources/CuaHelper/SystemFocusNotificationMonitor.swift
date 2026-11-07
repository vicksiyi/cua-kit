import CoreGraphics

protocol SystemFocusNotificationHandling: AnyObject {
    func filterSystemFocusNotification(_ event: CGEvent, viewBridgePID: Int32?) -> CGEvent?
}

// 0x10074bc30: annotated session, tail/default, process notifications only.
// Captures the ViewBridge PID at construction and keeps the owner weak.
// A released owner passes the original event without reading its fields.
final class SystemFocusNotificationMonitor {
    private let tap: EventTap
    init(viewBridgePID: Int32?, owner: any SystemFocusNotificationHandling,
         driver: EventTap.Driver = .system) {
        tap = EventTap(location: .session(.cgAnnotatedSessionEventTap),
            placement: .tailAppendEventTap, options: .defaultTap,
            eventsOfInterest: CGEventMask(1) << 21, driver: driver)
        tap.startMonitoring { [weak owner] _, event in
            guard let owner else { return event }
            return owner.filterSystemFocusNotification(event, viewBridgePID: viewBridgePID)
        }
    }
    deinit { tap.stopMonitoring() }
}
