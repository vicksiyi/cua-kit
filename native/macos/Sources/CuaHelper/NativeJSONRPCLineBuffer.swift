import Foundation

/// Recovered actor state machine. One pending consumer is the native contract;
/// the connection's request serialization must enforce that upstream.
actor NativeJSONRPCLineBuffer {
    private var lines = [String]()
    private var waiter: (id: UUID, continuation: CheckedContinuation<String?, Error>)?
    private var terminalError: Error?
    private var finished = false

    // Host diagnostic for verifying registration/cancellation races.
    var pendingWaiterID: UUID? { waiter?.id }

    /// Producer logic is inlined in the native reader at 0x100dcd874.
    func append(_ line: String) {
        guard !finished else { return }
        if let waiter {
            self.waiter = nil
            waiter.continuation.resume(returning: line)
        } else {
            lines.append(line)
        }
    }

    /// 0x100dd1be8: first finish wins; preserve queued lines.
    func finish(error: Error? = nil) {
        guard !finished else { return }
        terminalError = error
        finished = true
        if let waiter {
            self.waiter = nil
            if let error { waiter.continuation.resume(throwing: error) }
            else { waiter.continuation.resume(returning: nil) }
        }
    }

    func nextLine() async throws -> String? {
        if !lines.isEmpty { return lines.removeFirst() }
        if let terminalError { throw terminalError }
        if finished { return nil }
        let id = UUID()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                waiter = (id, continuation)
            }
        } onCancel: {
            Task { await self.cancelWaiter(id: id) }
        }
    }

    /// Identity matching prevents a delayed cancellation from clearing a newer
    /// waiter. Cancellation does not finish the stream or change its error.
    func cancelWaiter(id: UUID) {
        guard let waiter, waiter.id == id else { return }
        self.waiter = nil
        waiter.continuation.resume(throwing: CancellationError())
    }
}
