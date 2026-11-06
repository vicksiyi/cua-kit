import Foundation

/// Extracted cache branch of the pinned native policy provider (0x1000a7cbc).
/// The generic payload and injected clock/loader are reconstruction seams, not
/// claims about the original public API. This does not evaluate or grant access.
actor NativeAppPolicyCache<Policy: Sendable> {
    private var cachedPolicy: Policy?
    private var cachedAt: Date?
    private let now: @Sendable () -> Date
    private let load: @Sendable (TimeInterval) async throws -> Policy

    init(now: @escaping @Sendable () -> Date = { Date() },
         load: @escaping @Sendable (TimeInterval) async throws -> Policy) {
        self.now = now
        self.load = load
    }

    func policy() async throws -> Policy {
        let startedAt = now()
        if let cachedPolicy, let cachedAt,
           startedAt.timeIntervalSince(cachedAt) < 900 {
            return cachedPolicy
        }
        // The original await permits actor reentrancy; no in-flight task cache
        // or stale-on-error fallback is added here.
        let policy = try await load(30)
        cachedPolicy = policy
        cachedAt = startedAt
        return policy
    }
}
