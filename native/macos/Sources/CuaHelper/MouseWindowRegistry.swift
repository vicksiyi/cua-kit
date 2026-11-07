// Controller-owned plain dictionary, matching _windows. The owning controller
// serializes access; unlike WindowOrderingObserver's task state, this source
// storage is not an additional unfair lock. Read AX IDs before map mutation.
final class MouseWindowRegistry<Window> {
    private var storage: [UInt32: Window] = [:]
    private let windowID: (Window) throws -> UInt32
    private let observedWindowIDsChanged: ([UInt32]) -> Void

    init(windowID: @escaping (Window) throws -> UInt32,
        observedWindowIDsChanged: @escaping ([UInt32]) -> Void) {
        self.windowID = windowID
        self.observedWindowIDsChanged = observedWindowIDsChanged
    }
    func register(_ window: Window) {
        guard let id = try? windowID(window) else { return }
        var changed: [UInt32]?
        registerMouseWindow(window, windows: &storage, windowID: { _ in id },
            observedWindowIDsChanged: { changed = $0 })
        // Source ends dictionary mutation access before updating the observer.
        if let changed { observedWindowIDsChanged(changed) }
    }
    func windows() -> [UInt32: Window] {
        var snapshot = storage
        var changed: [UInt32]?
        pruneMouseWindows(&snapshot, accessibilityWindowID: windowID,
            observedWindowIDsChanged: { changed = $0 })
        if let changed {
            storage = snapshot
            observedWindowIDsChanged(changed)
        }
        return snapshot
    }
    // Menu-close 0x10006e228..0x10006e884 filters a snapshot by AX
    // element identity, then removes matching stored keys individually. Each
    // removal publishes current IDs; it does not reread AX window IDs/prune.
    func removeWindows(matching matches: (Window) -> Bool) {
        let snapshot = storage
        let matchingKeys = snapshot.filter { matches($0.value) }.map { $0.key }
        for key in matchingKeys {
            storage.removeValue(forKey: key)
            observedWindowIDsChanged(Array(storage.keys))
        }
    }

    func orderedWindows(orderedWindowIDs: () -> [UInt32]) -> [Window] {
        orderedMouseWindows(windows: windows, orderedWindowIDs: orderedWindowIDs)
    }
}
