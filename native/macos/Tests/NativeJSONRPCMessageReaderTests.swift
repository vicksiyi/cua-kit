import Foundation

private final class FixtureFailure: Error {}

@main struct NativeJSONRPCMessageReaderTests {
    static func main() async throws {
        let ready = NativeJSONRPCLineBuffer()
        await ready.append("{\"id\":7}")
        let message = try await NativeJSONRPCMessageReader.nextMessage(from: ready, timeout: 60, method: "ready")
        precondition(message?["id"] as? Int == 7)
        await ready.finish()
        let eof = try await NativeJSONRPCMessageReader.nextMessage(from: ready, timeout: 60, method: "eof")
        precondition(eof == nil)

        let idle = NativeJSONRPCLineBuffer()
        do {
            _ = try await NativeJSONRPCMessageReader.nextLine(from: idle, timeout: 0.01, method: "config/read")
            preconditionFailure("Expected timeout")
        } catch {
            precondition(error as? NativeJSONRPCMessageReader.ReadError == .requestTimedOut("config/read"))
        }
        let abandonedWaiter = await idle.pendingWaiterID
        precondition(abandonedWaiter == nil)
        await idle.append("after timeout")
        let recovered = try await NativeJSONRPCMessageReader.nextLine(from: idle, timeout: 60, method: "again")
        precondition(recovered == "after timeout")

        let cancelled = Task {
            try await NativeJSONRPCMessageReader.nextLine(from: idle, timeout: 60, method: "cancel")
        }
        while await idle.pendingWaiterID == nil { await Task.yield() }
        cancelled.cancel()
        do { _ = try await cancelled.value; preconditionFailure("Expected cancellation") }
        catch { precondition(error is CancellationError) }
        let cancelledWaiter = await idle.pendingWaiterID
        precondition(cancelledWaiter == nil)

        let failure = FixtureFailure()
        await idle.finish(error: failure)
        do {
            _ = try await NativeJSONRPCMessageReader.nextLine(from: idle, timeout: 60, method: "failure")
            preconditionFailure("Expected original reader failure")
        } catch { precondition(error as AnyObject === failure) }

        let malformed = NativeJSONRPCLineBuffer()
        await malformed.append("[]")
        do {
            _ = try await NativeJSONRPCMessageReader.nextMessage(from: malformed, timeout: 60, method: "decode")
            preconditionFailure("Expected decoding failure")
        } catch { precondition(error is NativeJSONRPCMessageDecoder.DecodeError) }
        print("native JSON-RPC message race, timeout, cancellation, EOF and errors passed")
    }
}
