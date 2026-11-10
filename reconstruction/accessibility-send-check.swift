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
        try await empty.send(delay: .milliseconds(10))
        for delay: Duration? in [nil, .zero, .milliseconds(10)] {
            trace = []; sent = 0
            var ticks: UInt64 = 100
            try await value.send(delay: delay, post: { event, tap in
                precondition(event === events[sent] && tap.rawValue == 1)
                precondition(CGEventAPI.getTimestamp(event) == UInt64(100 + sent))
                sent += 1; trace.append("post")
            }, timestamp: { trace.append("timestamp"); defer { ticks += 1 }; return ticks },
            now: { precondition(delay != nil); trace.append("now"); return instant },
            sleepUntil: { deadline in
                precondition(deadline == instant.advanced(by: delay!)); trace.append("sleep")
            })
            precondition(trace == (delay == nil
                ? ["timestamp", "post", "timestamp", "post"]
                : ["timestamp", "post", "now", "sleep", "timestamp", "post", "now", "sleep"]))
        }
        for cancel in [false, true] {
            trace = []
            do {
                try await value.send(delay: .zero, post: { _, _ in trace.append("post") },
                    timestamp: { 1 }, now: { instant }, sleepUntil: { _ in
                        trace.append("sleep")
                        if cancel { throw CancellationError() }
                        throw WaitError.failed
                    })
                preconditionFailure("global send wait error swallowed")
            } catch is CancellationError { precondition(cancel) }
              catch WaitError.failed { precondition(!cancel) }
            precondition(trace == ["post", "sleep"])
        }
        print("AccessibilitySupport sync/async send exports, order, last-event delay and error/cancellation checks passed; no event posting")
    }
}
