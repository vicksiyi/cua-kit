import Foundation

// Locked mutation wrapper reconstructed from 0x100746270. The enclosing
// enforcer supplies creation/removal of its click tap, while this store keeps
// state mutation and monitoring reconciliation under the same lock.
final class SyntheticFocusStateStore {
    private let lock = NSLock()
    private var state: SyntheticApplicationFocusState
    private let startClickMonitoring: () -> Void
    private let stopClickMonitoring: () -> Void
    init(state: SyntheticApplicationFocusState,
         startClickMonitoring: @escaping () -> Void,
         stopClickMonitoring: @escaping () -> Void) {
        self.state = state
        self.startClickMonitoring = startClickMonitoring
        self.stopClickMonitoring = stopClickMonitoring
    }
    var snapshot: SyntheticApplicationFocusState {
        lock.lock(); defer { lock.unlock() }; return state
    }
    func mutate<T>(_ body: (inout SyntheticApplicationFocusState) throws -> T) rethrows -> T {
        lock.lock(); defer { lock.unlock() }
        let before = state
        // Native throwing mutation exits before monitoring reconciliation;
        // mutations already performed are retained, rather than rolled back.
        let result = try body(&state)
        switch syntheticFocusClickMonitoringChange(before: before, after: state) {
        case .start: startClickMonitoring()
        case .stop: stopClickMonitoring()
        case .unchanged: break
        }
        return result
    }
}
