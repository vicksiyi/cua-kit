import CoreGraphics
import Dispatch
import SystemSoftware

public extension SynthesizedEvent {
    private static func postNativeEvent(_ event: CGEvent, to pid: Int32) {
        CGEventAPI.setTimestamp(event, timestamp: DispatchTime.now().uptimeNanoseconds)
        CGEventAPI.postToPid(event, pid: pid)
    }

    // Original synchronous0x100754280: timestamp and post every event in order.
    func send(to pid: Int32) throws {
        for event in cgEvents { Self.postNativeEvent(event, to: pid) }
    }

    // Exact original entry0x1007537e8. Dependency overload below is an explicit
    // additional test/host boundary, not the original exported signature.
    func send(to pid: Int32, delay: Duration?) async throws {
        try await send(to: pid, delay: delay, post: { Self.postNativeEvent($0, to: $1) })
    }

    //0x1007538b0: refresh timestamp/post each event, then optionally sleep
    // until continuous-clock now+delay, including after the last event.
    // A thrown sleep ends iteration; no retry/release event is invented here.
    func send(to pid: Int32, delay: Duration?,
        post: (CGEvent, Int32) -> Void,
        now: () -> ContinuousClock.Instant = { ContinuousClock().now },
        sleepUntil: (ContinuousClock.Instant) async throws -> Void = {
            try await ContinuousClock().sleep(until: $0, tolerance: nil)
        }
    ) async throws {
        for event in cgEvents {
            post(event, pid)
            if let delay { try await sleepUntil(now().advanced(by: delay)) }
        }
    }
    // Original0x100755440 uses session tap raw1, not HID tap raw0.
    func send(delay: Duration?) async throws {
        try await send(delay: delay, post: { CGEventAPI.post($0, tap: $1) })
    }

    // Explicit dependency boundary for unposted native-event verification.
    func send(delay: Duration?, post: (CGEvent, CGEventTapLocation) -> Void,
        timestamp: () -> UInt64 = { DispatchTime.now().uptimeNanoseconds },
        now: () -> ContinuousClock.Instant = { ContinuousClock().now },
        sleepUntil: (ContinuousClock.Instant) async throws -> Void = {
            try await ContinuousClock().sleep(until: $0, tolerance: nil)
        }
    ) async throws {
        for event in cgEvents {
            CGEventAPI.setTimestamp(event, timestamp: timestamp())
            post(event, .cgSessionEventTap)
            if let delay { try await sleepUntil(now().advanced(by: delay)) }
        }
    }

    // Original0x100753e80: handler receives event,isLast and an explicit
    // posting closure. The loop never auto-posts if the handler omits it.
    func send(to pid: Int32,
        handler: (CGEvent, Bool, () -> Void) async throws -> Void
    ) async throws {
        try await send(to: pid, handler: handler, post: { Self.postNativeEvent($0, to: $1) })
    }

    // Additional injection boundary; no once-only wrapper or cancellation check
    // is inserted around the original handler-controlled posting closure.
    func send(to pid: Int32,
        handler: (CGEvent, Bool, () -> Void) async throws -> Void,
        post: @escaping (CGEvent, Int32) -> Void
    ) async throws {
        for (index, event) in cgEvents.enumerated() {
            try await handler(event, index == cgEvents.count - 1, { post(event, pid) })
        }
    }

}
