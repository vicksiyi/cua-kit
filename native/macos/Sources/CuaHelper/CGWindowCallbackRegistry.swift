import os

// CallbackRegistry singleton state starts at zero (0x100258990). Its caller
// owns the concrete handler/window-map entry; retain the entry as one value.
final class CGWindowCallbackRegistry<Entry> {
    struct State {
        var lastID: UInt = 0
        var entries: [UInt: Entry] = [:]
    }
    private let storage = OSAllocatedUnfairLock(initialState: State())

    // 0x1002587b0: increment before insertion and return the new ID.
    // Checked UInt addition preserves the source overflow trap; removed IDs
    // are never reused and zero is not the first callback's ID.
    func register(_ entry: Entry) -> UInt {
        storage.withLock { state in
            state.lastID += 1
            state.entries[state.lastID] = entry
            return state.lastID
        }
    }
    // 0x100258860: return the removed entry, allowing the observer caller to
    // release its handler/window resources AFTER unlocking the registry.
    func remove(_ id: UInt) -> Entry? {
        storage.withLock { $0.entries.removeValue(forKey: id) }
    }
    // Raw event handling mutates the retained entry under the same lock. Its
    // payload interpretation remains a separate native callback boundary.
    func withState<Result>(_ operation: (inout State) -> Result) -> Result {
        storage.withLock(operation)
    }
}
