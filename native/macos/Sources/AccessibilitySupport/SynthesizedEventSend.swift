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
}
