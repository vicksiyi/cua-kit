import Foundation
import CoreGraphics

// Semantic projection of the fields read by 0x10074f8e4: state+0x18 is
// the intercepted destination, state+0x24 the repost PID. Native tag 2
// means no route. Full system notification/controller ownership is separate.
struct FocusStealKeyboardRoute {
    let interceptedPID: Int32
    let recipientPID: Int32
    // Optional logical owner at native state+0x1c/+0x20. A matching
    // intercepted owner must not generate registered focus transitions.
    let interceptedOwnerPID: Int32?
    init(interceptedPID: Int32, recipientPID: Int32, interceptedOwnerPID: Int32? = nil) {
        self.interceptedPID = interceptedPID; self.recipientPID = recipientPID
        self.interceptedOwnerPID = interceptedOwnerPID
    }
}

enum FocusStealRegistrationTransition: Equatable { case unchanged, gained, lost }

// Per-record selection in 0x10074d374..0x10074d3d4. The caller traverses
// the snapshot in registration order; duplicate PIDs remain distinct records.
func focusStealRegistrationTransition(pid: Int32, previousOwnerPID: Int32,
                                     currentOwnerPID: Int32,
                                     interceptedOwnerPID: Int32?) -> FocusStealRegistrationTransition {
    if pid == currentOwnerPID && pid != previousOwnerPID && interceptedOwnerPID != pid { return .gained }
    if pid == previousOwnerPID && pid != currentOwnerPID && interceptedOwnerPID != pid { return .lost }
    return .unchanged
}

// Native route tag: 0 waiting for intercepted focus, 1 observed, 2 absent.
enum FocusStealRouteObservation: Equatable {
    case noRoute, firstInterceptedFocus, repeatedInterceptedFocus, recipientFocus, cleared
}
struct FocusStealOwnerChange {
    let tasks: [Task<Bool, Never>]
    let routeObservation: FocusStealRouteObservation
    let requiresViewBridgeFocusInspection: Bool
    let firstInterceptedFocusReleaseSucceeded: Bool?
}

final class FocusStealKeyboardRoutingState {
    private let lock = NSLock()
    private var ownership: FocusStealOwnershipHistory
    private var route: FocusStealKeyboardRoute?
    private var keyFocusReturnWasSuppressed = false
    private var interceptedFocusWasObserved = false
    init(initialOwner: KeyFocusOwnerIdentity, route: FocusStealKeyboardRoute? = nil) {
        ownership = FocusStealOwnershipHistory(current: initialOwner)
        self.route = route
    }
    var ownershipSnapshot: FocusStealOwnershipHistory {
        lock.lock(); defer { lock.unlock() }; return ownership
    }
    func update(_ route: FocusStealKeyboardRoute?) {
        lock.lock(); defer { lock.unlock() }
        self.route = route
        keyFocusReturnWasSuppressed = false
        interceptedFocusWasObserved = false
    }
    func registrationTransition(pid: Int32, previousOwnerPID: Int32,
                                currentOwnerPID: Int32) -> FocusStealRegistrationTransition {
        lock.lock(); defer { lock.unlock() }
        return focusStealRegistrationTransition(pid: pid, previousOwnerPID: previousOwnerPID,
            currentOwnerPID: currentOwnerPID, interceptedOwnerPID: route?.interceptedOwnerPID)
    }
    // Changed-focus callback snapshots registrations under their own lock,
    // releases that list lock, then traverses the snapshot under state lock.
    // Returning task handles is an internal verification seam; production
    // callers may discard them, as the original callback does.
    @discardableResult
    func recordOwnerAndSchedule(_ owner: KeyFocusOwnerIdentity, physicalFocusPID: Int32,
        takeRegistrationSnapshot: () -> [FocusStealRegistrationCallbacks],
        releaseFirstInterceptedFocus: () -> Bool,
        isRegisteredOwner: (Int32) -> Bool,
        reportMissingHandler: @escaping @Sendable (Int32, FocusStealRegistrationTransition) -> Void = { _, _ in }
    ) -> FocusStealOwnerChange {
        lock.lock(); defer { lock.unlock() }
        ownership.record(owner)
        let previousOwnerPID = ownership.previous!.ownerPID
        let currentOwnerPID = ownership.current.ownerPID
        let registrations = takeRegistrationSnapshot()
        var tasks: [Task<Bool, Never>] = []
        for registration in registrations {
            let transition = focusStealRegistrationTransition(pid: registration.pid,
                previousOwnerPID: previousOwnerPID, currentOwnerPID: currentOwnerPID,
                interceptedOwnerPID: route?.interceptedOwnerPID)
            if let task = scheduleFocusStealRegistrationCallback(registration,
                transition: transition, reportMissingHandler: reportMissingHandler) {
                tasks.append(task)
            }
        }
        // Source selects callbacks before updating interception progress.
        let observation = observePhysicalFocusPIDLocked(physicalFocusPID)
        // 0x10074e2b0..0x10074e2c8: only tag 0 -> 1 reaches this
        // direct release path. Other observations need separate handling.
        let inspectViewBridge = viewBridgeFocusTransitionNeedsInspection(
            previous: ownership.previous!, current: ownership.current,
            routeObservation: observation, isRegistered: isRegisteredOwner)
        let released = observation == .firstInterceptedFocus ? releaseFirstInterceptedFocus() : nil
        return FocusStealOwnerChange(tasks: tasks, routeObservation: observation,
            requiresViewBridgeFocusInspection: inspectViewBridge,
            firstInterceptedFocusReleaseSucceeded: released)
    }
    // 0x10074dd78..0x10074e0e4 and 0x10074e6f8: retain a route for
    // either physical endpoint. Any third PID clears route and both flags.
    func observePhysicalFocusPID(_ pid: Int32) -> FocusStealRouteObservation {
        lock.lock(); defer { lock.unlock() }
        return observePhysicalFocusPIDLocked(pid)
    }
    private func observePhysicalFocusPIDLocked(_ pid: Int32) -> FocusStealRouteObservation {
        guard let route else { return .noRoute }
        if pid == route.interceptedPID {
            if interceptedFocusWasObserved { return .repeatedInterceptedFocus }
            interceptedFocusWasObserved = true
            return .firstInterceptedFocus
        }
        if pid == route.recipientPID { return .recipientFocus }
        self.route = nil
        interceptedFocusWasObserved = false
        keyFocusReturnWasSuppressed = false
        return .cleared
    }
    // 0x10074c8d0..0x10074c95c. Resolve the incoming physical PID while
    // holding state lock, then test its logical owner against registrations.
    // Return the original notification if allowed and clear any stale route.
    func filterKeyFocusTaken(_ event: CGEvent,
                             incomingFocusPID: Int32, destinationPID: Int32,
                             resolveOwnerPID: (Int32) -> Int32,
                             isRegistered: (Int32) -> Bool) -> CGEvent? {
        lock.lock(); defer { lock.unlock() }
        let ownerPID = resolveOwnerPID(incomingFocusPID)
        let registered = isRegistered(ownerPID)
        let suppress = registered && ownerPID != ownership.current.ownerPID
        route = suppress ? FocusStealKeyboardRoute(interceptedPID: incomingFocusPID,
                                                   recipientPID: destinationPID,
                                                   interceptedOwnerPID: ownerPID) : nil
        keyFocusReturnWasSuppressed = false
        interceptedFocusWasObserved = false
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
