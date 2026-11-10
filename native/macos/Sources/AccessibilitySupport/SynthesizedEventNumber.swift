import Foundation

// Native getter 0x1007547b8 returns the current Int64, increments with overflow
// checking, and stores the next value at 0x101574978 (initial value zero).
// The lock protects the CLI host's callers; it is not a recovered vendor lock.
private let synthesizedEventNumberLock = NSLock()
private var synthesizedEventNumber: Int64 = 0
public extension SynthesizedEvent {
    static var nextEventNumber: Int64 {
        synthesizedEventNumberLock.lock()
        defer { synthesizedEventNumberLock.unlock() }
        let number = synthesizedEventNumber
        synthesizedEventNumber += 1
        return number
    }
}
