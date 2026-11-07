import os

// logger(for:) at 0x100622d48 -> 0x100623e00. Category is String(describing:)
// of the metatype, and the dictionary is protected by an allocated unfair lock.
func cachedNativeLogger(for type: Any.Type,
    cache: OSAllocatedUnfairLock<[String: Logger]>,
    makeLogger: (String) -> Logger
) -> Logger {
    let category = String(describing: type)
    return cache.withLock { entries in
        if let logger = entries[category] { return logger }
        let logger = makeLogger(category)
        entries[category] = logger
        return logger
    }
}

enum NativeLogger {
    // Source LoggingSubsystem constant at 0x10147c0c8 (CFString payload).
    static let loggingSubsystem = "inc.software.app"
    private static let cache = OSAllocatedUnfairLock(initialState: [String: Logger]())

    static func logger(for type: Any.Type) -> Logger {
        cachedNativeLogger(for: type, cache: cache) {
            Logger(subsystem: loggingSubsystem, category: $0)
        }
    }
}
