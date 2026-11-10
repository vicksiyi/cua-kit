import AccessibilitySupport
import CoreGraphics

// Controller scroll tail0x100081c9c..0x100081d64. Upstream resolves the
// transformed point/window and validates its process. This stage constructs
// one synthesized event and sends it with a 10ms delay, without page chunking.
func dispatchControllerScroll<Event>(at point: CGPoint, deltaX: Int, deltaY: Int,
    targetPID: Int32, window: MouseWindow?,
    makeEvent: (CGPoint, Int, Int, MouseWindow?) throws -> Event,
    sendEvent: (Event, Int32, Duration) async throws -> Void
) async throws {
    let event = try makeEvent(point, deltaX, deltaY, window)
    try await sendEvent(event, targetPID, .milliseconds(10))
}

// Concrete native dependencies, with posting/clock seams for no-input checks.
// This remains a tail operation; callers must resolve/validate targets first.
func dispatchControllerScroll(at point: CGPoint, deltaX: Int, deltaY: Int,
    targetPID: Int32, window: MouseWindow?,
    post: (CGEvent, Int32) -> Void = { dispatchNativeEvent($0, to: $1) },
    now: () -> ContinuousClock.Instant = { ContinuousClock().now },
    sleepUntil: (ContinuousClock.Instant) async throws -> Void = {
        try await ContinuousClock().sleep(until: $0, tolerance: nil)
    }
) async throws {
    try await dispatchControllerScroll(at: point, deltaX: deltaX, deltaY: deltaY,
        targetPID: targetPID, window: window,
        makeEvent: { try SynthesizedEvent.scroll(at: $0, deltaX: $1, deltaY: $2, inWindow: $3) },
        sendEvent: { event, pid, delay in
            try await event.send(to: pid, delay: delay, post: post, now: now, sleepUntil: sleepUntil)
        })
}
