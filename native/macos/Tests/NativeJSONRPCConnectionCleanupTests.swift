import Foundation
import os

private final class Events: @unchecked Sendable {
    let values = OSAllocatedUnfairLock(initialState: [String]())
    func add(_ value: String) { values.withLock { $0.append(value) } }
    var snapshot: [String] { values.withLock { $0 } }
}
private enum FixtureError: Error { case closeFailed }

@main struct NativeJSONRPCConnectionCleanupTests {
    static func main() async {
        for running in [false, true] {
            for failClose in [false, true] {
                let events = Events()
                let (release, releaseContinuation) = AsyncStream<Void>.makeStream()
                let (completed, completedContinuation) = AsyncStream<Void>.makeStream()
                let cleanup = NativeJSONRPCConnectionCleanup(closeInput: {
                    events.add("input")
                    if failClose { throw FixtureError.closeFailed }
                }, cancelReader: { events.add("cancel") }, isRunning: {
                    events.add("running"); return running
                }, terminate: { events.add("terminate") }, awaitReader: {
                    for await _ in release { break }
                    events.add("reader-ended")
                }, closeOutput: {
                    events.add("output")
                    completedContinuation.yield(())
                    completedContinuation.finish()
                    if failClose { throw FixtureError.closeFailed }
                })
                DispatchQueue.concurrentPerform(iterations: 128) { _ in cleanup.close() }
                let expected = ["input", "cancel", "running"] + (running ? ["terminate"] : [])
                precondition(events.snapshot == expected)
                // close() has returned, but the reader has not finished: the
                // output descriptor must still be open at this point.
                releaseContinuation.yield(())
                releaseContinuation.finish()
                for await _ in completed { break }
                cleanup.close()
                precondition(events.snapshot == expected + ["reader-ended", "output"])
            }
        }
        print("native JSON-RPC close idempotence, concurrent calls, ordering and errors passed")
    }
}
