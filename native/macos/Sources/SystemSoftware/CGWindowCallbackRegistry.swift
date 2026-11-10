import os

// CallbackRegistry singleton state starts at zero (0x100258990). Its caller
// owns the concrete handler/window-map entry; retain the entry as one value.
public final class CGWindowCallbackRegistry<Entry> {
    public struct State {
        public var lastID: UInt = 0
        public var entries: [UInt: Entry] = [:]
    }
    private let storage = OSAllocatedUnfairLock(initialState: State())

    public init() {}

    // 0x1002587b0: increment before insertion and return the new ID.
    // Checked UInt addition preserves the source overflow trap; removed IDs
    // are never reused and zero is not the first callback's ID.
    public func register(_ entry: Entry) -> UInt {
        storage.withLock { state in
            state.lastID += 1
            state.entries[state.lastID] = entry
            return state.lastID
        }
    }
    // 0x100258860: return the removed entry, allowing the observer caller to
    // release its handler/window resources AFTER unlocking the registry.
    public func remove(_ id: UInt) -> Entry? {
        storage.withLock { $0.entries.removeValue(forKey: id) }
    }
    // 0x10025a9d0: copy/retain an entry while locked; native window lookup
    // and handler invocation run after this method has unlocked.
    public func entry(_ id: UInt) -> Entry? { storage.withLock { $0.entries[id] } }
    // Explicit state seam for isolated ownership checks.
    public func withState<Result>(_ operation: (inout State) -> Result) -> Result {
        storage.withLock(operation)
    }
}
