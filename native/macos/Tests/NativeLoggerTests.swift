import Foundation
import os

@main struct Test {
    enum A { struct Item {} }
    enum B { struct Item {} }
    struct Different {}
    static func main() {
        let cache = OSAllocatedUnfairLock(initialState: [String: Logger]())
        var categories: [String] = []
        func make(_ category: String) -> Logger {
            categories.append(category)
            return Logger(subsystem: "core.cua.fixture", category: category)
        }
        _ = cachedNativeLogger(for: A.Item.self, cache: cache, makeLogger: make)
        _ = cachedNativeLogger(for: B.Item.self, cache: cache, makeLogger: make)
        precondition(categories == ["Item"]) // Native key is a description, not type identity.
        DispatchQueue.concurrentPerform(iterations: 32) { _ in
            _ = cachedNativeLogger(for: Different.self, cache: cache, makeLogger: make)
        }
        precondition(categories == ["Item", "Different"])
        precondition(cache.withLock { $0.count } == 2)
        precondition(NativeLogger.loggingSubsystem == "inc.software.app")
        print("Native logger preserves category description, lazy creation and locked cache reuse")
    }
}
