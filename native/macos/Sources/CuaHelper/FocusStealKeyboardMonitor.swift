import Foundation
import CoreGraphics

// Semantic projection of the fields read by 0x10074f8e4: state+0x18 is
// the intercepted destination, state+0x24 the repost PID. Native tag 2
// means no route. Full system notification/controller ownership is separate.
struct FocusStealKeyboardRoute {
    let interceptedPID: Int32
    let recipientPID: Int32
}

final class FocusStealKeyboardRoutingState {
    private let lock = NSLock()
    private var route: FocusStealKeyboardRoute?
    private var keyFocusReturnWasSuppressed = false
    init(route: FocusStealKeyboardRoute? = nil) { self.route = route }
    func update(_ route: FocusStealKeyboardRoute?) {
        lock.lock(); defer { lock.unlock() }
        self.route = route
        keyFocusReturnWasSuppressed = false
    }
    // 0x10074c8d0..0x10074c95c. Resolve the incoming physical PID while
    // holding state lock, then test its logical owner against registrations.
    // Return the original notification if allowed and clear any stale route.
    func filterKeyFocusTaken(_ event: CGEvent, previousOwnerPID: Int32,
                             incomingFocusPID: Int32, destinationPID: Int32,
                             resolveOwnerPID: (Int32) -> Int32,
                             isRegistered: (Int32) -> Bool) -> CGEvent? {
        lock.lock(); defer { lock.unlock() }
        let ownerPID = resolveOwnerPID(incomingFocusPID)
        let registered = isRegistered(ownerPID)
        let suppress = registered && ownerPID != previousOwnerPID
        route = suppress ? FocusStealKeyboardRoute(interceptedPID: incomingFocusPID,
                                                   recipientPID: destinationPID) : nil
        keyFocusReturnWasSuppressed = false
        return suppress ? nil : event
    }
    // 0x10074cbd0: suppress only the first returned-focus notification
    // for the route recipient. Native byte state+0x29 records suppression;
    // it does not clear the keyboard route or change either PID.
    func filterKeyFocusReturned(_ event: CGEvent, destinationPID: Int32) -> CGEvent? {
        lock.lock(); defer { lock.unlock() }
        guard let route, !keyFocusReturnWasSuppressed,
              route.recipientPID == destinationPID else { return event }
        keyFocusReturnWasSuppressed = true
        return nil
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
