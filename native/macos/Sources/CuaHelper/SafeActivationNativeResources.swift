import Foundation
import CoreGraphics

// Locked payload shared by the two native observation callbacks and the
// restoration loop. NSLock replaces the source's unfair-lock storage only.
final class SafeActivationObservationStore {
    private let lock = NSLock()
    private var value = SafeActivationObservedEvents()
    init(time: Double) { value.beginForegroundRestoration(time: time) }
    func access<T>(_ body: (inout SafeActivationObservedEvents) -> T) -> T {
        lock.lock(); defer { lock.unlock() }
        return body(&value)
    }
    var snapshot: SafeActivationObservedEvents { access { $0 } }
}

struct WindowUpdateDriver {
    var mainConnection: () -> OpaquePointer?
    var disable: (OpaquePointer?) -> CGError
    var reenable: (OpaquePointer?) -> CGError
    static let system = Self(mainConnection: WindowServerSPI.mainConnectionID,
        disable: WindowServerSPI.disableUpdate, reenable: WindowServerSPI.reenableUpdate)
}

// Concrete resources for the other-foreground-app branch only. Does not choose
// that branch or replace safelyEnforceActiveState's remaining restoration loop.
final class SafeActivationNativeResources {
    typealias TargetObserver = (CGEventType, CGEvent) -> Bool
    static let foregroundMask: CGEventMask = (1 << 13) | (1 << 20) | (1 << 19)
    static let targetInputMask: CGEventMask = (1 << 10) | (1 << 11) | (1 << 12)
    let observations: SafeActivationObservationStore
    private let foregroundTap: EventTap
    private let targetTap: EventTap
    private let clock: () -> Double
    private let savedPID: () -> Int32
    private let helperPID: Int32
    private let targetPID: Int32
    private let setTargetObserver: (TargetObserver?) -> Void
    private let updates: WindowUpdateDriver
    private let post: (CGEvent, Int32) -> Void
    private var connection: OpaquePointer?

    init(savedPID: @escaping () -> Int32, targetPID: Int32,
         helperPID: Int32 = ProcessInfo.processInfo.processIdentifier,
         setTargetObserver: @escaping (TargetObserver?) -> Void,
         clock: @escaping () -> Double = { ProcessInfo.processInfo.systemUptime },
         tapDriver: EventTap.Driver = .system, updates: WindowUpdateDriver = .system,
         post: @escaping (CGEvent, Int32) -> Void = { $0.postToPid($1) }) {
        self.savedPID = savedPID; self.targetPID = targetPID; self.helperPID = helperPID
        self.setTargetObserver = setTargetObserver; self.clock = clock
        self.updates = updates; self.post = post
        observations = SafeActivationObservationStore(time: clock())
        foregroundTap = EventTap(location: .process(savedPID()), placement: .headInsertEventTap,
            options: .defaultTap, eventsOfInterest: Self.foregroundMask, driver: tapDriver)
        targetTap = EventTap(location: .process(targetPID), placement: .headInsertEventTap,
            options: .defaultTap, eventsOfInterest: Self.targetInputMask, driver: tapDriver)
    }

    func enforceAndRestore(enforce: () throws -> Void,
                           driver: SafeActivationRestorationDriver) async throws {
        try await withSafeActivationRestoration(operations: operations, enforce: enforce) { error in
            try await restoreSafeActivationForeground(targetPID: self.targetPID,
                savedPID: self.savedPID(), enforcementFailed: error != nil,
                observations: self.observations, driver: driver)
        }
    }

    var operations: SafeActivationScopeOperations {
        let observations = self.observations, clock = self.clock
        let helperPID = self.helperPID, targetPID = self.targetPID
        let savedPID = self.savedPID, post = self.post
        return SafeActivationScopeOperations(startForegroundMonitoring: {
            self.foregroundTap.startMonitoring { type, event in
                observations.access { $0.filter(type: type, event: event, time: clock()) }
            }
        }, startTargetMonitoring: {
            self.targetTap.startMonitoring { _, event in
                routeInputDuringSafeActivation(event, helperPID: helperPID, targetPID: targetPID,
                    previousApplicationPID: savedPID, post: post)
            }
        }, installTargetObserver: {
            self.setTargetObserver { type, event in
                observations.access {
                    $0.targetRequestsSuppression(type: type.rawValue,
                        subtypeValue: event.getIntegerValueField(CGEventField(rawValue: 83)!), time: clock())
                }
            }
        }, disableUpdates: {
            self.connection = self.updates.mainConnection()
            _ = self.updates.disable(self.connection)
        }, reenableUpdates: {
            _ = self.updates.reenable(self.connection)
        }, clearTargetObserver: { self.setTargetObserver(nil) },
        stopTargetMonitoring: { self.targetTap.stopMonitoring() },
        stopForegroundMonitoring: { self.foregroundTap.stopMonitoring() })
    }
}
