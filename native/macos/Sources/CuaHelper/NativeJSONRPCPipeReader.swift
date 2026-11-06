import Foundation

/// Reader loop uses Foundation FileHandle.AsyncBytes.lines in the original.
/// Preserve Foundation's framing/decoding instead of implementing a splitter.
enum NativeJSONRPCPipeReader {
    static func read(_ handle: FileHandle, into buffer: NativeJSONRPCLineBuffer) async {
        await consume(handle.bytes.lines, into: buffer)
    }

    // Sequence injection is a host test seam. Task creation and descriptor
    // ownership belong to the connection, not this loop.
    static func consume<Lines: AsyncSequence>(_ lines: Lines, into buffer: NativeJSONRPCLineBuffer) async
    where Lines.Element == String {
        do {
            for try await line in lines { await buffer.append(line) }
            await buffer.finish()
        } catch {
            await buffer.finish(error: error)
        }
    }
}
