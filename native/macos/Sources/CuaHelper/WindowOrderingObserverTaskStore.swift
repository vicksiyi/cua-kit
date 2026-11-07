import os

// Lock-protected ownership in WindowOrderingObserver. Native async task bodies
// and menuDidOpen are composed separately; no substitute polling task is made.
final class WindowOrderingObserverTaskStore<Handle> {
    struct State {
        var observedWindowIDs: [UInt32]
        var task: Handle?
        var menuTask: Handle?
    }
    private let storage: OSAllocatedUnfairLock<State>
    private let cancel: (Handle) -> Void

    init(observedWindowIDs: [UInt32], cancel: @escaping (Handle) -> Void) {
        storage = OSAllocatedUnfairLock(initialState: State(observedWindowIDs: observedWindowIDs))
        self.cancel = cancel
    }
    var observedWindowIDs: [UInt32] {
        get { storage.withLock { $0.observedWindowIDs } }
        set { storage.withLock { $0.observedWindowIDs = newValue } }
    }
    // 0x100789008 / 0x100789058: create and store under lock only when nil.
    func start(makeTask: () -> Handle) {
        storage.withLock { state in
            guard state.task == nil else { return }
            state.task = makeTask()
        }
    }
    // Explicit boundary for the separately restored menuDidOpen task policy.
    func withState<Result>(_ operation: (inout State) -> Result) -> Result {
        storage.withLock(operation)
    }
    // 0x100788fac: menu close leaves the main task and observed IDs untouched.
    func menuDidClose() {
        storage.withLock { state in
            if let handle = state.menuTask { cancel(handle) }
            state.menuTask = nil
        }
    }
    // 0x100788060 and deinit 0x100787fc0: main cancellation/clear precede
    // menu cancellation/clear, all while holding the same unfair lock.
    func stop() {
        storage.withLock { state in
            if let handle = state.task { cancel(handle) }
            state.task = nil
            if let handle = state.menuTask { cancel(handle) }
            state.menuTask = nil
        }
    }
    deinit { stop() }
}
