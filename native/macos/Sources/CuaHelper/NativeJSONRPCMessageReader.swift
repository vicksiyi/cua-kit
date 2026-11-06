import Foundation

/// nextMessage's structured race (0x100dd0e34..<0x100dd1864).
/// The connection must serialize consumers of its line buffer.
enum NativeJSONRPCMessageReader {
    // Host representation of the recovered requestTimedOut(method) case.
    enum ReadError: Error, Equatable { case requestTimedOut(String) }

    static func nextLine(from buffer: NativeJSONRPCLineBuffer,
                         timeout: TimeInterval, method: String) async throws -> String? {
        try await withThrowingTaskGroup(of: String?.self) { group in
            group.addTask { try await buffer.nextLine() }
            group.addTask {
                // Preserve the source's UInt64 conversion, rather than inventing
                // a clamp or a special interpretation for zero timeout.
                try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                throw ReadError.requestTimedOut(method)
            }
            // Both successful delivery/EOF and errors cancel the losing task.
            // Structured scope exit waits for that child's cancellation cleanup.
            defer { group.cancelAll() }
            return try await group.next() ?? nil
        }
    }

    static func nextMessage(from buffer: NativeJSONRPCLineBuffer,
                            timeout: TimeInterval, method: String) async throws -> [String: Any]? {
        let line = try await nextLine(from: buffer, timeout: timeout, method: method)
        // Decode only after the task group has settled, as in the original tail.
        return try NativeJSONRPCMessageDecoder.decode(line: line)
    }
}
