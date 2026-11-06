import Foundation

private final class Clock: @unchecked Sendable {
    private let lock = NSLock()
    private var value: TimeInterval = 0
    func set(_ value: TimeInterval) { lock.lock(); defer { lock.unlock() }; self.value = value }
    func now() -> Date { lock.lock(); defer { lock.unlock() }; return Date(timeIntervalSince1970: value) }
}
private enum Failure: Error { case offline }
private actor Loader {
    var calls = 0
    var fail = false
    var completionTime: TimeInterval?
    let clock: Clock
    init(_ clock: Clock) { self.clock = clock }
    func configure(fail: Bool = false, completionTime: TimeInterval? = nil) {
        self.fail = fail; self.completionTime = completionTime
    }
    func load(_ timeout: TimeInterval) throws -> Int {
        precondition(timeout == 30)
        calls += 1
        if let completionTime { clock.set(completionTime) }
        if fail { throw Failure.offline }
        return calls
    }
}

@main struct NativeAppPolicyCacheTests {
    static func main() async throws {
        let clock = Clock()
        let loader = Loader(clock)
        let cache = NativeAppPolicyCache(now: { clock.now() }, load: { try await loader.load($0) })
        let initial = try await cache.policy()
        precondition(initial == 1)
        clock.set(899.999)
        let fresh = try await cache.policy()
        precondition(fresh == 1)
        clock.set(900)
        let boundary = try await cache.policy()
        precondition(boundary == 2)

        // Failed refresh propagates rather than returning stale data; it also
        // leaves the previous cache untouched (observable after clock rollback).
        clock.set(1800)
        await loader.configure(fail: true)
        do { _ = try await cache.policy(); preconditionFailure("Expected failure") }
        catch Failure.offline { }
        clock.set(901)
        let preserved = try await cache.policy()
        precondition(preserved == 2)
        clock.set(1800)
        await loader.configure(completionTime: 2000)
        let recovered = try await cache.policy()
        precondition(recovered == 4)
        // Timestamp is request start (1800), not completion (2000).
        clock.set(2699)
        let beforeExpiry = try await cache.policy()
        precondition(beforeExpiry == 4)
        clock.set(2700)
        await loader.configure()
        let expired = try await cache.policy()
        precondition(expired == 5)
        clock.set(-1)
        let negativeAge = try await cache.policy()
        precondition(negativeAge == 5)
        print("native policy cache expiry, request-start timestamp, errors and clock rollback passed")
    }
}
