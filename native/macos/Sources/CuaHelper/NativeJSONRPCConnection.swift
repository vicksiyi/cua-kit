import Foundation

/// Process/pipe initializer at 0x100dccf24 and deinit at 0x100dd0d9c.
/// Launch URL/arguments must come from the host's separately resolved launch
/// configuration. This type does not discover or impersonate a vendor client.
/// Like the original, requests require a single serial consumer.
final class NativeJSONRPCConnection: NativeAppPolicyConnection {
    private let process: Process
    private let input: Pipe
    private let output: Pipe
    private let buffer: NativeJSONRPCLineBuffer
    private let reader: Task<Void, Never>
    private let cleanup: NativeJSONRPCConnectionCleanup
    private let timeout: TimeInterval

    init(executableURL: URL, arguments: [String], timeout: TimeInterval) throws {
        let buffer = NativeJSONRPCLineBuffer()
        let input = Pipe(), output = Pipe(), process = Process()
        process.executableURL = executableURL
        process.arguments = arguments
        process.standardInput = input
        process.standardOutput = output
        if let null = FileHandle(forWritingAtPath: "/dev/null") { process.standardError = null }
        try process.run()
        // Parent must release the child's ends after launch. Errors closing
        // these unused ends are ignored by the source initializer.
        try? input.fileHandleForReading.close()
        try? output.fileHandleForWriting.close()
        let handle = output.fileHandleForReading
        let reader = Task.detached(priority: .utility) {
            await NativeJSONRPCPipeReader.read(handle, into: buffer)
        }
        self.process = process
        self.input = input
        self.output = output
        self.buffer = buffer
        self.reader = reader
        self.timeout = timeout
        self.cleanup = NativeJSONRPCConnectionCleanup(input: input, output: output,
                                                      reader: reader, process: process)
    }

    func request(method: String, params: [String: Any]?) async throws -> [String: Any] {
        try await request(method: method, params: params, notificationHandler: nil)
    }

    func request(method: String, params: [String: Any]?,
                 notificationHandler: (([String: Any]) async -> Void)?) async throws -> [String: Any] {
        try await NativeJSONRPCRequestExchange.request(method: method, params: params,
            input: input.fileHandleForWriting, buffer: buffer, timeout: timeout,
            isClosed: { self.cleanup.isClosed }, notificationHandler: notificationHandler)
    }

    func close() { cleanup.close() }
    deinit { cleanup.close() }
}
