import Foundation
import CoreGraphics

// Per-instance owner from 0x10074b88c. The source static singleton/menu APIs
// are separate; do not treat this constructor as the complete lifecycle API.
final class SystemFocusStealPreventer: SystemFocusNotificationHandling {
    struct Dependencies {
        var constants = SystemFocusNotificationConstants()
        var readInteger: (CGEvent, CGEventField) -> Int64 = { $0.getIntegerValueField($1) }
        var resolveOwner: (Int32) -> KeyFocusOwnerIdentity
        var releaseFocus: (CGEvent) -> Bool
        var compensateViewBridge: (Int32, CGEvent, (Int32) -> Bool) -> Bool
        var postKeyboard: (CGEvent, Int32) -> Void = { $0.postToPid($1) }
        var reportMissingHandler: @Sendable (Int32, FocusStealRegistrationTransition) -> Void = { _, _ in }

        static func system(transaction: @escaping () -> UIElementTransactionCache? = { UIElementTreeTransaction.current?.cache },
            reportAXError: @escaping (Error) -> Void,
            reportReleaseFailure: @escaping (SystemKeyFocusReleaseFailure) -> Void
        ) -> Self {
            Self(resolveOwner: { systemKeyFocusOwnerIdentity(pid: $0, transaction: transaction(), reportError: reportAXError) },
                releaseFocus: { releaseSystemKeyFocus(for: $0, reportFailure: reportReleaseFailure) },
                compensateViewBridge: { pid, event, registered in
                    systemViewBridgeFocusCompensation(previousOwnerPID: pid, transaction: transaction(), event: event,
                        isRegisteredOwner: registered, scheduleRefresh: { scheduleViewBridgeKeyFocusRefresh(for: $0) },
                        reportAXError: reportAXError, reportReleaseFailure: reportReleaseFailure)
                })
        }
    }
    private let registrations: FocusStealRegistrationStore<FocusStealRegistration>
    private let state: FocusStealKeyboardRoutingState
    private let dependencies: Dependencies
    private let helperPID: Int32
    private let tapDriver: EventTap.Driver
    private var systemMonitor: SystemFocusNotificationMonitor?
    private var viewBridgeKeyboardMonitor: FocusStealKeyboardMonitor?

    init(initialOwner: () -> KeyFocusOwnerIdentity, viewBridgePID: () -> Int32?,
         helperPID: Int32 = ProcessInfo.processInfo.processIdentifier,
         dependencies: Dependencies, tapDriver: EventTap.Driver = .system,
         becameEmpty: @escaping () -> Void) {
        self.dependencies = dependencies; self.helperPID = helperPID; self.tapDriver = tapDriver
        registrations = FocusStealRegistrationStore(pid: { $0.pid }, becameEmpty: becameEmpty)
        state = FocusStealKeyboardRoutingState(initialOwner: initialOwner())
        let bridgePID = viewBridgePID()
        systemMonitor = SystemFocusNotificationMonitor(viewBridgePID: bridgePID, owner: self, driver: tapDriver)
        // Source 0x10074ba24 skips this resource when the auxiliary PID is nil.
        if let bridgePID {
            viewBridgeKeyboardMonitor = FocusStealKeyboardMonitor(pid: bridgePID, helperPID: helperPID,
                state: state, post: dependencies.postKeyboard, driver: tapDriver)
        }
    }
    func register(pid: Int32, lost: (@Sendable () -> Void)?, gained: (@Sendable () -> Void)?) {
        let record = FocusStealRegistration(pid: pid, helperPID: helperPID, state: state,
            targetLostFocusHandler: lost, targetGainedFocusHandler: gained,
            driver: tapDriver, postKeyboard: dependencies.postKeyboard)
        registrations.append(record)
    }
    @discardableResult func unregister(pid: Int32) -> Bool { registrations.removeFirst(pid: pid) }
    func isRegistered(pid: Int32) -> Bool { registrations.snapshot.contains { $0.pid == pid } }
    func startSuppressingMenuDismissalEvents(for pid: Int32, menuPID: Int32?,
        windowOwnerPID: @escaping (UInt32) -> Int32? = syntheticFocusWindowOwnerPID) {
        // Source builds resources before acquiring the list lock, including
        // when the requested registration is absent; replacement is first-only.
        let taps = menuDismissalEventTaps(targetPID: pid, menuPID: menuPID, driver: tapDriver) { [weak self] _, event in
            guard let self else { return event }
            return filterMenuDismissalEvent(event, targetPID: pid, menuPID: menuPID,
                suppressionEnabled: { self.registrations.snapshot.contains { $0.pid == pid && $0.isMenuDismissalSuppressionEnabled } },
                eventWindowID: { syntheticFocusClickWindowID(event) }, windowOwnerPID: windowOwnerPID)
        }
        registrations.mutateFirst(pid: pid) { record in
            record.mouseEventTaps = taps
            record.isMenuDismissalSuppressionEnabled = true
        }
    }
    func stopSuppressingMenuDismissalEvents(for pid: Int32) {
        registrations.mutateFirst(pid: pid) { record in
            record.mouseEventTaps = nil
            record.isMenuDismissalSuppressionEnabled = false
        }
    }
    var ownershipSnapshot: FocusStealOwnershipHistory { state.ownershipSnapshot }

    func filterSystemFocusNotification(_ event: CGEvent, viewBridgePID: Int32?) -> CGEvent? {
        routeSystemFocusNotification(event, viewBridgePID: viewBridgePID,
            constants: dependencies.constants, readInteger: dependencies.readInteger,
            taken: { event, pid, destination in
                self.state.filterKeyFocusTaken(event, incomingFocusPID: pid, destinationPID: destination,
                    resolveOwnerPID: { self.dependencies.resolveOwner($0).ownerPID },
                    isRegistered: { self.isRegistered(pid: $0) })
            }, returned: { self.state.filterKeyFocusReturned($0, destinationPID: $1) },
            changed: { event, pid in
                // Source 0x10074ca50 resolves identity before acquiring state lock.
                let owner = self.dependencies.resolveOwner(pid)
                self.state.recordOwnerAndSchedule(owner, physicalFocusPID: pid,
                    takeRegistrationSnapshot: { self.registrations.snapshot.map { $0.callbackSnapshot } },
                    releaseFirstInterceptedFocus: { self.dependencies.releaseFocus(event) },
                    isRegisteredOwner: { self.isRegistered(pid: $0) },
                    compensateViewBridge: { self.dependencies.compensateViewBridge($0, event, { self.isRegistered(pid: $0) }) },
                    reportMissingHandler: self.dependencies.reportMissingHandler)
            }, newFront: { event in
                self.state.filterNewFront(event, readFocusPID: { event in
                    guard let field = self.dependencies.constants.focusPIDField else { return nil }
                    return Int32(self.dependencies.readInteger(event, field))
                })
            })
    }
    deinit { systemMonitor = nil; viewBridgeKeyboardMonitor = nil }
}
