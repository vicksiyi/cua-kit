import Foundation
private final class FixtureFailure: Error {}

@main struct NativeJSONRPCPipeReaderTests {
    static func main() async throws {
        // Foundation is the framing oracle. Both independent pipes receive the
        // same bytes; no app server, model request or user process is involved.
        let payload = Data("alpha\n\nβ😀\r\nomega".utf8)
        func preparedPipe() throws -> Pipe {
            let pipe = Pipe()
            try pipe.fileHandleForWriting.write(contentsOf: payload)
            try pipe.fileHandleForWriting.close()
            return pipe
        }
        let oracle = try preparedPipe(), actual = try preparedPipe()
        defer {
            try? oracle.fileHandleForReading.close()
            try? actual.fileHandleForReading.close()
        }
        var expected = [String]()
        for try await line in oracle.fileHandleForReading.bytes.lines { expected.append(line) }
        precondition(expected.contains("alpha") && expected.contains("β😀") && expected.last == "omega")
        let buffer = NativeJSONRPCLineBuffer()
        await NativeJSONRPCPipeReader.read(actual.fileHandleForReading, into: buffer)
        var received = [String]()
        while let line = try await buffer.nextLine() { received.append(line) }
        precondition(received == expected)
        // Integration across pipe framing, buffering and JSON object decoding.
        let jsonPipe = Pipe()
        defer { try? jsonPipe.fileHandleForReading.close() }
        try jsonPipe.fileHandleForWriting.write(contentsOf: Data("{\"id\":1}\r\n{\"result\":\"应用\"}".utf8))
        try jsonPipe.fileHandleForWriting.close()
        let messages = NativeJSONRPCLineBuffer()
        await NativeJSONRPCPipeReader.read(jsonPipe.fileHandleForReading, into: messages)
        let first = try NativeJSONRPCMessageDecoder.decode(line: await messages.nextLine())
        let last = try NativeJSONRPCMessageDecoder.decode(line: await messages.nextLine())
        let eof = try NativeJSONRPCMessageDecoder.decode(line: await messages.nextLine())
        precondition(first?["id"] as? Int == 1 && last?["result"] as? String == "应用" && eof == nil)

        let failure = FixtureFailure()
        let (stream, continuation) = AsyncThrowingStream<String, Error>.makeStream()
        continuation.yield("buffered")
        continuation.finish(throwing: failure)
        let failed = NativeJSONRPCLineBuffer()
        await NativeJSONRPCPipeReader.consume(stream, into: failed)
        let buffered = try await failed.nextLine()
        precondition(buffered == "buffered")
        do { _ = try await failed.nextLine(); preconditionFailure("Expected reader error") }
        catch { precondition(error as AnyObject === failure) }
        print("native JSON-RPC pipe reader Foundation framing, EOF and error propagation passed")
    }
}
