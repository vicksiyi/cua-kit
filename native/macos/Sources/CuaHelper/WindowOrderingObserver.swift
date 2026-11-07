import AppKit

// Complete observer composition; dependencies expose native boundaries for
// isolated lifetime checks. Production specialization below uses WindowServer.
final class WindowOrderingObserver<Window, Observer, Application> {
    private let store: WindowOrderingObserverTaskStore<Task<Void, Never>>
    private let makeObserver: ([UInt32], [WindowServerEvent], @escaping (Window, WindowServerEvent) -> Void) -> Observer
    private let restore: (Window, @escaping () -> [UInt32]) async throws -> Void
    private let windowOwnerPID: (UInt32) -> Int32?
    private let frontmostApplication: () -> Application?
    private let processIdentifier: (Application) -> Int32
    private let runMenuTask: (Int32, [UInt32]) async -> Void
    private let reportError: (Error) -> Void

    init(observedWindowIDs: [UInt32],
        makeObserver: @escaping ([UInt32], [WindowServerEvent], @escaping (Window, WindowServerEvent) -> Void) -> Observer,
        restore: @escaping (Window, @escaping () -> [UInt32]) async throws -> Void,
        windowOwnerPID: @escaping (UInt32) -> Int32?, frontmostApplication: @escaping () -> Application?,
        processIdentifier: @escaping (Application) -> Int32,
        runMenuTask: @escaping (Int32, [UInt32]) async -> Void, reportError: @escaping (Error) -> Void) {
        store = WindowOrderingObserverTaskStore(observedWindowIDs: observedWindowIDs, cancel: { $0.cancel() })
        self.makeObserver = makeObserver; self.restore = restore
        self.windowOwnerPID = windowOwnerPID; self.frontmostApplication = frontmostApplication
        self.processIdentifier = processIdentifier; self.runMenuTask = runMenuTask; self.reportError = reportError
    }
    var observedWindowIDs: [UInt32] {
        get { store.observedWindowIDs }
        set { store.observedWindowIDs = newValue }
    }
    func start() {
        let makeObserver = makeObserver, reportError = reportError
        store.start {
            Task { [weak self] in
                await runWindowOrderingEventLoop(weakOwner: { [weak self] in self },
                    observedWindowIDs: { $0.observedWindowIDs }, makeObserver: makeObserver,
                    handle: { owner, window, _ in
                        try await owner.restore(window, { owner.observedWindowIDs })
                    }, reportError: reportError)
            }
        }
    }
    func stop() { store.stop() }
    func menuDidOpen() {
        let runMenuTask = runMenuTask
        openWindowOrderingMenu(store: store, windowOwnerPID: windowOwnerPID,
            frontmostApplication: frontmostApplication, processIdentifier: processIdentifier,
            makeTask: { pid, ids in Task { await runMenuTask(pid, ids) } })
    }
    func menuDidClose() { store.menuDidClose() }
    deinit { store.stop() }
}

typealias NativeWindowOrderingObserver = WindowOrderingObserver<NativeWindowDescription, NativeCGWindowObserver, NSRunningApplication>

extension WindowOrderingObserver where Window == NativeWindowDescription, Observer == NativeCGWindowObserver, Application == NSRunningApplication {
    convenience init(observedWindowIDs: [UInt32], reportError: @escaping (Error) -> Void) {
        self.init(observedWindowIDs: observedWindowIDs,
            makeObserver: { NativeCGWindowObserver(windowIDs: $0, events: $1, handler: $2) },
            restore: { try await restoreNativeWindowOrderingAfterChange($0, observedWindowIDs: $1, reportError: reportError) },
            windowOwnerPID: { systemNativeWindowDescription($0)?.ownerPID },
            frontmostApplication: { NSWorkspace.shared.frontmostApplication }, processIdentifier: { $0.processIdentifier },
            runMenuTask: { await runNativeWindowOrderingMenuTask(pid: $0, observedWindowIDs: $1, reportError: reportError) },
            reportError: reportError)
    }
}
