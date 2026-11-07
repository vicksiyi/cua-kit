import CoreGraphics

// Target-process monitor from enforcer init 0x100740624. The full enforcer
// also owns frontmost tracking, focus-steal prevention and click monitoring.
final class SyntheticFocusTargetMonitor {
    let state: SyntheticFocusStateStore
    let activationFilter: SyntheticFocusActivationFilter
    private let tap: EventTap
    init(pid: Int32, initialState: SyntheticApplicationFocusState,
         startClickMonitoring: @escaping () -> Void,
         stopClickMonitoring: @escaping () -> Void,
         driver: EventTap.Driver = .system) {
        state = SyntheticFocusStateStore(state: initialState,
            startClickMonitoring: startClickMonitoring, stopClickMonitoring: stopClickMonitoring)
        activationFilter = SyntheticFocusActivationFilter(state: state)
        tap = EventTap(location: .process(pid), placement: .headInsertEventTap,
            options: .defaultTap, eventsOfInterest: SafeActivationNativeResources.foregroundMask,
            driver: driver)
        let filter = activationFilter
        tap.startMonitoring { type, event in filter.filter(type: type, event: event) }
    }
    func setActivationSuppression(_ callback: SyntheticFocusActivationFilter.Suppression?) {
        activationFilter.setSuppression(callback)
    }
    func observeFrontmostPID(_ pid: Int32?, targetPID: Int32) {
        state.mutate { $0.observeFrontmostPID(pid, targetPID: targetPID) }
    }
    deinit { tap.stopMonitoring() }
}
