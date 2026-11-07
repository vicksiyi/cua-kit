import Foundation

enum PollError: Error, Equatable { case timeoutReached }

// 0x10077d320..0x10077d4b0: Foundation Date (wall clock), not system
// uptime/ContinuousClock. Check elapsed time before the first condition and
// after every failed condition's sleep. The exact timeout remains eligible.
func pollUntilTrueSync(timeout: Double, delay: Double,
    makeStartDate: () -> Date = { Date() }, currentDate: () -> Date = { .now },
    sleep: (Double) -> Void = { Thread.sleep(forTimeInterval: $0) },
    condition: () -> Bool) throws {
    let started = makeStartDate()
    while currentDate().timeIntervalSince(started) <= timeout {
        if condition() { return }
        sleep(delay)
    }
    throw PollError.timeoutReached
}
