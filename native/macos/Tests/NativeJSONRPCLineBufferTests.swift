import Foundation
private final class FixtureFailure: Error {}

@main struct NativeJSONRPCLineBufferTests {
    static func registered(_ buffer: NativeJSONRPCLineBuffer) async -> UUID {
        while true {
            if let id = await buffer.pendingWaiterID { return id }
            await Task.yield()
        }
    }
    static func main() async throws {
        let failure = FixtureFailure()
        let buffer = NativeJSONRPCLineBuffer()
        await buffer.append("first")
        await buffer.append("")
        await buffer.finish(error: failure)
        await buffer.finish()
        await buffer.append("ignored")
        let first = try await buffer.nextLine(), second = try await buffer.nextLine()
        precondition(first == "first" && second == "")
        for _ in 0..<2 {
            do { _ = try await buffer.nextLine(); preconditionFailure("Expected terminal error") }
            catch { precondition(error as AnyObject === failure) }
        }
        let clean = NativeJSONRPCLineBuffer()
        await clean.finish()
        await clean.finish(error: failure)
        let eof = try await clean.nextLine()
        precondition(eof == nil)

        let stream = NativeJSONRPCLineBuffer()
        let waiting = Task { try await stream.nextLine() }
        let oldID = await registered(stream)
        await stream.append("delivered")
        let delivered = try await waiting.value
        precondition(delivered == "delivered")
        let replacement = Task { try await stream.nextLine() }
        let newID = await registered(stream)
        precondition(newID != oldID)
        await stream.cancelWaiter(id: oldID)
        let stillWaiting = await stream.pendingWaiterID
        precondition(stillWaiting == newID)
        replacement.cancel()
        do { _ = try await replacement.value; preconditionFailure("Expected cancellation") }
        catch is CancellationError {}
        await stream.append("after-cancel")
        let after = try await stream.nextLine()
        precondition(after == "after-cancel")

        for withError in [false, true] {
            let stream = NativeJSONRPCLineBuffer()
            let waiting = Task { try await stream.nextLine() }
            _ = await registered(stream)
            await stream.finish(error: withError ? failure : nil)
            do {
                let line = try await waiting.value
                precondition(!withError && line == nil)
            } catch { precondition(withError && error as AnyObject === failure) }
        }
        // Cancellation already requested before registration still wakes the
        // pending continuation through the actor-scheduled cancellation handler.
        let preCancelled = NativeJSONRPCLineBuffer()
        let (gate, release) = AsyncStream<Void>.makeStream()
        let task = Task {
            for await _ in gate { break }
            return try await preCancelled.nextLine()
        }
        task.cancel(); release.finish()
        do { _ = try await task.value; preconditionFailure("Expected pre-cancellation") }
        catch is CancellationError {}
        print("native JSON-RPC line buffer FIFO, termination, delivery and cancellation passed")
    }
}
