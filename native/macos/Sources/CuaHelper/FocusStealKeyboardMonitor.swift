import Foundation
import CoreGraphics

// Semantic projection of the fields read by 0x10074f8e4: state+0x18 is
// the intercepted destination, state+0x24 the repost PID. Native tag 2
// means no route. Producers of this projection still require reconstruction.
struct FocusStealKeyboardRoute {
    let interceptedPID: Int32
    let recipientPID: Int32
}

final class FocusStealKeyboardRoutingState {
    private let lock = NSLock()
    private var route: FocusStealKeyboardRoute?
    init(route: FocusStealKeyboardRoute? = nil) { self.route = route }
    func update(_ route: FocusStealKeyboardRoute?) {
        lock.lock(); defer { lock.unlock() }; self.route = route
    }
    // Source holds its state lock through postToPid; retain event/timestamp.
    func filter(_ event: CGEvent, post: (CGEvent, Int32) -> Void) -> CGEvent? {
        lock.lock(); defer { lock.unlock() }
        guard let route else { return event }
        let destination = Int32(event.getIntegerValueField(.eventTargetUnixProcessID))
        guard destination == route.interceptedPID else { return event }
        post(event, route.recipientPID)
        return nil
    }
}

// 0x10074b1cc / 0x10074f7f4: persistent registration resource, distinct
// from the temporary safe-activation tap. Weak state and helper bypass
// precede locked routing. No synthesized timestamp or focus mutation here.
final class FocusStealKeyboardMonitor {
    static let mask: CGEventMask = (1 << 10) | (1 << 11) | (1 << 12)
    private let tap: EventTap
    init(pid: Int32, helperPID: Int32, state: FocusStealKeyboardRoutingState,
         post: @escaping (CGEvent, Int32) -> Void = { $0.postToPid($1) },
         driver: EventTap.Driver = .system) {
        tap = EventTap(location: .process(pid), placement: .tailAppendEventTap,
            options: .defaultTap, eventsOfInterest: Self.mask, driver: driver)
        tap.startMonitoring { [weak state] _, event in
            guard let state else { return event }
            let source = Int32(event.getIntegerValueField(.eventSourceUnixProcessID))
            if source == helperPID { return event }
            return state.filter(event, post: post)
        }
    }
    deinit { tap.stopMonitoring() }
}
