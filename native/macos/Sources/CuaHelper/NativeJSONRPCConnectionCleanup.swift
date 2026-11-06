import Foundation
import os

/// Native close lifecycle at 0x100dd0958. Resource callbacks are host seams;
/// the convenience initializer binds them to the original Foundation types.
final class NativeJSONRPCConnectionCleanup: @unchecked Sendable {
    private let closed = OSAllocatedUnfairLock(initialState: false)
    private let closeInput: @Sendable () throws -> Void
    private let cancelReader: @Sendable () -> Void
    private let isRunning: @Sendable () -> Bool
    private let terminate: @Sendable () -> Void
    private let awaitReader: @Sendable () async -> Void
    private let closeOutput: @Sendable () throws -> Void

    var isClosed: Bool { closed.withLock { $0 } }

    init(closeInput: @escaping @Sendable () throws -> Void,
         cancelReader: @escaping @Sendable () -> Void,
         isRunning: @escaping @Sendable () -> Bool,
         terminate: @escaping @Sendable () -> Void,
         awaitReader: @escaping @Sendable () async -> Void,
         closeOutput: @escaping @Sendable () throws -> Void) {
        self.closeInput = closeInput
        self.cancelReader = cancelReader
        self.isRunning = isRunning
        self.terminate = terminate
        self.awaitReader = awaitReader
        self.closeOutput = closeOutput
    }

    convenience init(input: Pipe, output: Pipe, reader: Task<Void, Never>, process: Process) {
        self.init(closeInput: { try input.fileHandleForWriting.close() },
                  cancelReader: { reader.cancel() }, isRunning: { process.isRunning },
                  terminate: { process.terminate() }, awaitReader: { await reader.value },
                  closeOutput: { try output.fileHandleForReading.close() })
    }

    func close() {
        let firstClose = closed.withLock { isClosed in
            guard !isClosed else { return false }
            isClosed = true
            return true
        }
        guard firstClose else { return }
        // Work runs outside the lock. Closing is idempotent even if a callback
        // re-enters close, and input-close failure must not skip later cleanup.
        try? closeInput()
        cancelReader()
        if isRunning() { terminate() }
        let awaitReader = self.awaitReader, closeOutput = self.closeOutput
        Task {
            await awaitReader()
            try? closeOutput()
        }
    }
}
