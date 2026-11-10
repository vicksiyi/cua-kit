import AccessibilitySupport
import CoreGraphics
import SystemSoftware

@main struct Check {
    enum WaitError: Error { case failed }
    static func main() async throws {
        let events = [CGEventAPI.create(source: nil)!, CGEventAPI.create(source: nil)!]
        let value = SynthesizedEvent(cgEvents: events)
        let instant = ContinuousClock().now
        var trace: [String] = [], sent = 0
        try await value.send(to: 42, delay: .milliseconds(10), post: { event, pid in
            precondition(event === events[sent] && pid == 42)
            sent += 1; trace.append("post")
        }, now: { trace.append("now"); return instant }, sleepUntil: { deadline in
            precondition(deadline == instant.advanced(by: .milliseconds(10)))
            trace.append("sleep")
        })
        precondition(trace == ["post", "now", "sleep", "post", "now", "sleep"])
        trace = []
        try await value.send(to: 42, delay: nil, post: { _, _ in trace.append("post") },
            now: { preconditionFailure("clock read for absent delay") },
            sleepUntil: { _ in preconditionFailure("sleep for absent delay") })
        precondition(trace == ["post", "post"])
        for cancel in [false, true] {
            trace = []
            do {
                try await value.send(to: 42, delay: .zero, post: { _, _ in trace.append("post") },
                    now: { instant }, sleepUntil: { deadline in
                        precondition(deadline == instant); trace.append("sleep")
                        if cancel { throw CancellationError() }
                        throw WaitError.failed
                    })
                preconditionFailure("wait error swallowed")
            } catch is CancellationError { precondition(cancel) }
              catch WaitError.failed { precondition(!cancel) }
            precondition(trace == ["post", "sleep"])
        }
        let empty = SynthesizedEvent(cgEvents: [])
        try empty.send(to: 42)
        try await empty.send(to: 42, delay: .milliseconds(10))
        try await empty.send(to: 42, delay: nil, post: { _, _ in preconditionFailure() })
        print("AccessibilitySupport sync/async send exports, order, last-event delay and error/cancellation checks passed; no event posting")
    }
}
