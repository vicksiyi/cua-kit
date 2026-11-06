import Foundation

@main struct NativeJSONRPCRequestWriterTests {
    static func main() async throws {
        if CommandLine.arguments.contains("--invalid-number") {
            // Foundation raises an Objective-C exception, not a Swift Error,
            // for this invalid object. Exercise it only in a disposable process.
            _ = try NativeJSONRPCRequestWriter.send(method: "bad", params: ["number": Double.nan],
                to: FileHandle.standardOutput, isClosed: {
                    print("unexpected-closed-check")
                    return true
                })
            preconditionFailure("Expected Foundation exception")
        }
        let pipe = Pipe()
        defer { try? pipe.fileHandleForReading.close() }
        let first = try NativeJSONRPCRequestWriter.send(method: "requirements/read", params: nil,
            to: pipe.fileHandleForWriting, isClosed: { false })
        let second = try NativeJSONRPCRequestWriter.send(method: "config/read", params: [:],
            to: pipe.fileHandleForWriting, isClosed: { false })
        let third = try NativeJSONRPCRequestWriter.send(method: "应用\n😀", params: ["text": "a\nb", "null": NSNull()],
            to: pipe.fileHandleForWriting, isClosed: { false })
        precondition(Set([first, second, third]).count == 3)
        precondition([first, second, third].allSatisfy { UUID(uuidString: $0) != nil })
        // The denied frame must never reach the stream.
        do {
            _ = try NativeJSONRPCRequestWriter.send(method: "closed", params: nil,
                to: pipe.fileHandleForWriting, isClosed: { true })
            preconditionFailure("Expected appServerExited")
        } catch { precondition(error is NativeJSONRPCRequestWriter.WriteError) }
        try pipe.fileHandleForWriting.close()
        let buffer = NativeJSONRPCLineBuffer()
        await NativeJSONRPCPipeReader.read(pipe.fileHandleForReading, into: buffer)
        var messages = [[String: Any]]()
        while let line = try await buffer.nextLine() {
            messages.append(try NativeJSONRPCMessageDecoder.decode(line: line)!)
        }
        precondition(messages.count == 3)
        precondition(Set(messages[0].keys) == ["id", "method"])
        precondition(messages[0]["id"] as? String == first)
        precondition(messages[0]["method"] as? String == "requirements/read")
        precondition((messages[1]["params"] as? [String: Any])?.isEmpty == true)
        precondition(messages[2]["method"] as? String == "应用\n😀")
        precondition((messages[2]["params"] as? [String: Any])?["text"] as? String == "a\nb")
        do {
            _ = try NativeJSONRPCRequestWriter.send(method: "write-failure", params: nil,
                to: pipe.fileHandleForWriting, isClosed: { false })
            preconditionFailure("Expected FileHandle failure")
        } catch { precondition(!(error is NativeJSONRPCRequestWriter.WriteError)) }
        print("native JSON-RPC request framing, pipe integration and failure ordering passed")
    }
}
