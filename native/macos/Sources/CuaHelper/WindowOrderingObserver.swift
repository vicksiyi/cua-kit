#if canImport(SystemSoftware)
import SystemSoftware
#endif
import AppKit

// Complete observer composition; dependencies expose native boundaries for
// isolated lifetime checks. Production specialization below uses WindowServer.
final class WindowOrderingObserver<Window, Iterator: WindowOrderingEventIterator, Application> where Iterator.Element == (Window, WindowServerEvent) {
    private let store: WindowOrderingObserverTaskStore<Task<Void, Never>>
    private let makeIterator: ([UInt32]) -> Iterator
    private let restore: (Window, @escaping () -> [UInt32]) async throws -> Void
    private let windowOwnerPID: (UInt32) -> Int32?
    private let frontmostApplication: () -> Application?
    private let processIdentifier: (Application) -> Int32
    private let runMenuTask: (Int32, [UInt32]) async -> Void
    private let reportError: (Error) -> Void

    init(observedWindowIDs: [UInt32],
        makeIterator: @escaping ([UInt32]) -> Iterator,
        restore: @escaping (Window, @escaping () -> [UInt32]) async throws -> Void,
        windowOwnerPID: @escaping (UInt32) -> Int32?, frontmostApplication: @escaping () -> Application?,
        processIdentifier: @escaping (Application) -> Int32,
        runMenuTask: @escaping (Int32, [UInt32]) async -> Void, reportError: @escaping (Error) -> Void) {
        store = WindowOrderingObserverTaskStore(observedWindowIDs: observedWindowIDs, cancel: { $0.cancel() })
        self.makeIterator = makeIterator; self.restore = restore
        self.windowOwnerPID = windowOwnerPID; self.frontmostApplication = frontmostApplication
        self.processIdentifier = processIdentifier; self.runMenuTask = runMenuTask; self.reportError = reportError
    }
    var observedWindowIDs: [UInt32] {
        get { store.observedWindowIDs }
        set { store.observedWindowIDs = newValue }
    }
    func start() {
        let makeIterator = makeIterator, reportError = reportError
        store.start {
            Task { [weak self] in
                await runWindowOrderingEventLoop(weakOwner: { [weak self] in self },
                    observedWindowIDs: { $0.observedWindowIDs }, makeIterator: makeIterator,
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

typealias NativeWindowOrderingObserver = WindowOrderingObserver<NativeWindowDescription, CGWindow.EventStream.AsyncIterator, NSRunningApplication>

extension WindowOrderingObserver where Window == NativeWindowDescription, Iterator == CGWindow.EventStream.AsyncIterator, Application == NSRunningApplication {
    convenience init(observedWindowIDs: [UInt32], reportError: @escaping (Error) -> Void) {
        self.init(observedWindowIDs: observedWindowIDs,
            makeIterator: { nativeOrderingWindowEventStream(observedWindowIDs: $0).makeAsyncIterator() },
            restore: { try await restoreNativeWindowOrderingAfterChange($0, observedWindowIDs: $1, reportError: reportError) },
            windowOwnerPID: { systemNativeWindowDescription($0)?.ownerPID },
            frontmostApplication: { NSWorkspace.shared.frontmostApplication }, processIdentifier: { $0.processIdentifier },
            runMenuTask: { await runNativeWindowOrderingMenuTask(pid: $0, observedWindowIDs: $1, reportError: reportError) },
            reportError: reportError)
    }
}

// Generic injected observer initializer is for fixtures; native specialization
// above creates the original nominal EventStream iterator directly.
extension WindowOrderingObserver {
    convenience init<Observer>(observedWindowIDs: [UInt32],
        makeObserver: @escaping ([UInt32], [WindowServerEvent], @escaping @Sendable (Window, WindowServerEvent) -> Void) -> Observer,
        restore: @escaping (Window, @escaping () -> [UInt32]) async throws -> Void,
        windowOwnerPID: @escaping (UInt32) -> Int32?, frontmostApplication: @escaping () -> Application?,
        processIdentifier: @escaping (Application) -> Int32,
        runMenuTask: @escaping (Int32, [UInt32]) async -> Void, reportError: @escaping (Error) -> Void
    ) where Iterator == CGWindowEventStream<Window, Observer>.AsyncIterator {
        self.init(observedWindowIDs: observedWindowIDs,
            makeIterator: { orderingWindowEventStream(observedWindowIDs: $0, makeObserver: makeObserver).makeAsyncIterator() },
            restore: restore, windowOwnerPID: windowOwnerPID, frontmostApplication: frontmostApplication,
            processIdentifier: processIdentifier, runMenuTask: runMenuTask, reportError: reportError)
    }
}
