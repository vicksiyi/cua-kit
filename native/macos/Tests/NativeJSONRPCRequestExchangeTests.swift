import Foundation
private final class FixtureError: Error {}

@main struct NativeJSONRPCRequestExchangeTests {
    static func main() async throws {
        var instant = Date(timeIntervalSince1970: 0)
        var timeouts = [TimeInterval]()
        var notifications = [String]()
        var messages: [[String: Any]] = [
            ["id": 123, "result": ["wrong": true]],
            ["id": "other", "method": "progress", "error": "ignored"],
            ["method": 123],
            ["id": "target", "method": "not-notification", "result": ["ok": true]],
        ]
        let result = try await NativeJSONRPCRequestExchange.receive(id: "target", method: "config/read", timeout: 10,
            now: { instant }, nextMessage: { remaining in
                timeouts.append(remaining)
                instant = instant.addingTimeInterval(1)
                return messages.removeFirst()
            }, notificationHandler: { message in
                notifications.append(message["method"] as! String)
                instant = instant.addingTimeInterval(2)
            })
        precondition(result["ok"] as? Bool == true)
        precondition(timeouts == [10, 9, 6, 5] && notifications == ["progress"])
        for value: Any in [NSNull(), 42, "text", [], ["key": "value"]] {
            let result = try await NativeJSONRPCRequestExchange.receive(id: "x", method: "read", timeout: 10,
                nextMessage: { _ in ["id": "x", "result": value] })
            precondition(result.count == (value is [String: Any] ? 1 : 0))
        }
        let absent = try await NativeJSONRPCRequestExchange.receive(id: "x", method: "read", timeout: 10,
            nextMessage: { _ in ["id": "x"] })
        precondition(absent.isEmpty)
        let errors: [(Any, String?)] = [("text", "text"), (["message": "detail"], "detail"),
            (["message": 42], nil), (NSNull(), nil), (42, nil), (["message": ""], "")]
        for (value, expected) in errors {
            do {
                _ = try await NativeJSONRPCRequestExchange.receive(id: "x", method: "read", timeout: 10,
                    nextMessage: { _ in ["id": "x", "error": value, "result": ["ok": true]] })
                preconditionFailure("Expected rejection")
            } catch { precondition(error as? NativeJSONRPCRequestExchange.ResponseError == .requestRejected(method: "read", message: expected)) }
        }
        do {
            _ = try await NativeJSONRPCRequestExchange.receive(id: "x", method: "eof", timeout: 10,
                nextMessage: { _ in nil })
            preconditionFailure("Expected exit")
        } catch { precondition(error is NativeJSONRPCRequestWriter.WriteError) }
        let original = FixtureError()
        do {
            _ = try await NativeJSONRPCRequestExchange.receive(id: "x", method: "failure", timeout: 10,
                nextMessage: { _ in throw original })
            preconditionFailure("Expected original error")
        } catch { precondition(error as AnyObject === original) }
        var reads = 0
        do {
            _ = try await NativeJSONRPCRequestExchange.receive(id: "x", method: "slow-handler", timeout: 10,
                now: { instant }, nextMessage: { _ in reads += 1; return ["method": "progress"] },
                notificationHandler: { _ in instant = instant.addingTimeInterval(10) })
            preconditionFailure("Expected shared deadline expiration")
        } catch { precondition(error as? NativeJSONRPCMessageReader.ReadError == .requestTimedOut("slow-handler")) }
        precondition(reads == 1)
        for timeout in [0.0, -1] {
            do {
                _ = try await NativeJSONRPCRequestExchange.receive(id: "x", method: "expired", timeout: timeout,
                    nextMessage: { _ in preconditionFailure("Must not read after deadline") })
                preconditionFailure("Expected timeout")
            } catch { precondition(error as? NativeJSONRPCMessageReader.ReadError == .requestTimedOut("expired")) }
        }
        // Full exchange with project-owned pipes and an in-process fake peer.
        let outgoing = Pipe(), incoming = Pipe()
        let buffer = NativeJSONRPCLineBuffer()
        let reader = Task { await NativeJSONRPCPipeReader.read(incoming.fileHandleForReading, into: buffer) }
        let (peerDone, peerContinuation) = AsyncThrowingStream<Void, Error>.makeStream()
        // Use a dedicated blocking fake peer; only the client uses the
        // restored async reader. The original peer runs in a separate process.
        Thread.detachNewThread {
            do {
                var line = Data()
                while let byte = try outgoing.fileHandleForReading.read(upToCount: 1), !byte.isEmpty {
                    if byte.first == 10 { break }
                    line.append(byte)
                }
                let request = try JSONSerialization.jsonObject(with: line) as! [String: Any]
                let response: [String: Any] = ["id": request["id"]!, "result": ["received": request["method"]!]]
                var bytes = try JSONSerialization.data(withJSONObject: response)
                bytes.append(10)
                try incoming.fileHandleForWriting.write(contentsOf: bytes)
                try incoming.fileHandleForWriting.close()
                peerContinuation.finish()
            } catch { peerContinuation.finish(throwing: error) }
        }
        let actual = try await NativeJSONRPCRequestExchange.request(method: "config/read", params: [:],
            input: outgoing.fileHandleForWriting, buffer: buffer, timeout: 3, isClosed: { false })
        precondition(actual["received"] as? String == "config/read")
        for try await _ in peerDone {}
        await reader.value
        try outgoing.fileHandleForWriting.close()
        try outgoing.fileHandleForReading.close()
        try incoming.fileHandleForReading.close()
        print("native JSON-RPC exchange dispatch, deadline, errors and pipe integration passed")
    }
}
