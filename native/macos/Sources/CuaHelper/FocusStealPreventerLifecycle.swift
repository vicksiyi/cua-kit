import Foundation

// Singleton ownership behavior from 0x10075044c and 0x10074af90.
// No extra lock is introduced around the singleton: the source locks the
// registration list, and retains the selected owner until stop has unlocked it.
final class FocusStealPreventerLifecycle {
    typealias Factory = (@escaping () -> Void) -> SystemFocusStealPreventer
    private var instance: SystemFocusStealPreventer?
    private let makeInstance: Factory
    private let resolveInitialOwner: () -> KeyFocusOwnerIdentity

    init(makeInstance: @escaping Factory, resolveInitialOwner: @escaping () -> KeyFocusOwnerIdentity) {
        self.makeInstance = makeInstance
        self.resolveInitialOwner = resolveInitialOwner
    }

    func startPreventingFocusStealing(for pid: Int32,
        targetLostFocusHandler: (@Sendable () -> Void)?,
        targetGainedFocusHandler: (@Sendable () -> Void)?) {
        let owner: SystemFocusStealPreventer
        if let existing = instance {
            owner = existing
        } else {
            owner = makeInstance { [weak self] in self?.instance = nil }
            instance = owner
        }
        owner.register(pid: pid, lost: targetLostFocusHandler, gained: targetGainedFocusHandler)
    }

    func stopPreventingFocusStealing(for pid: Int32) {
        guard let owner = instance else { return }
        // Last removal clears the singleton while the record-list lock is held.
        // The source's local retain prevents destruction until after unlocking.
        withExtendedLifetime(owner) { _ = owner.unregister(pid: pid) }
    }

    func isAppCurrentlyFocused(_ pid: Int32) -> Bool {
        // 0x100750594: an existing owner uses its locked cached identity;
        // without one, query the same registry/workspace path as initialization.
        let ownerPID = instance?.ownershipSnapshot.current.ownerPID ?? resolveInitialOwner().ownerPID
        return ownerPID == pid
    }
}
