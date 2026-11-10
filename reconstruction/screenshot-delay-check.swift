@main struct Check {
    final class Failure: Error {}
    static func main() async throws {
        for delay in [nil, -1, 0, 1, 2, Int.max] as [Int?] {
            var events: [String] = []
            let value = try await captureScreenshotAfterDelay(delay: delay, sleep: { duration in
                events.append("sleep")
                precondition(duration.components.seconds == Int64(delay!))
                precondition(duration.components.attoseconds == 0)
            }, acquire: { events.append("acquire"); return 42 },
                capture: { content in precondition(content == 42); events.append("capture"); return 7 })
            precondition(value == 7)
            precondition(events == ((delay ?? 0) > 0 ? ["sleep", "acquire", "capture"] : ["acquire", "capture"]))
        }
        let failure = Failure()
        for stage in ["sleep", "acquire", "capture"] {
            var events: [String] = []
            do {
                let _: Int = try await captureScreenshotAfterDelay(delay: 1,
                    sleep: { _ in events.append("sleep"); if stage == "sleep" { throw failure } },
                    acquire: { events.append("acquire"); if stage == "acquire" { throw failure }; return 42 },
                    capture: { _ in events.append("capture"); throw failure })
                preconditionFailure("Must propagate stage failure")
            } catch { precondition(error as AnyObject === failure) }
            precondition(events == (stage == "sleep" ? ["sleep"] : stage == "acquire" ? ["sleep", "acquire"] : ["sleep", "acquire", "capture"]))
        }
        // Exercise real Swift cancellation without waiting for the requested delay.
        let task = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            return try await captureScreenshotAfterDelay(delay: 60,
                acquire: { () async throws -> Int in preconditionFailure("Cancelled sleep must not acquire") },
                capture: { _ in 7 })
        }
        do { _ = try await task.value; preconditionFailure("Cancellation must propagate") }
        catch is CancellationError { }
        print("Screenshot delay checks passed")
    }
}
