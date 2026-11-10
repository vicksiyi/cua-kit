import CoreGraphics

extension SynthesizedEvent {
    //0x1007538b0: refresh timestamp/post each event, then optionally sleep
    // until continuous-clock now+delay, including after the last event.
    // A thrown sleep ends iteration; no retry/release event is invented here.
    func send(to pid: Int32, delay: Duration?,
        post: (CGEvent, Int32) -> Void = { dispatchNativeEvent($0, to: $1) },
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
