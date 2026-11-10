import Foundation

// Independent opt-in diagnostics, not part of the original Sky wire schema.
// Sky's Perform action has a void response, so returning routing information
// from Mouse alone cannot make it into the agent's tool-result log.
func recordNativeInputDiagnostic(_ result: [String: Any], event: String = "native.input.dispatched") {
    guard let path = ProcessInfo.processInfo.environment["CUA_NATIVE_INPUT_LOG"],
          path.hasPrefix("/") else { return }
    let record: [String: Any] = [
        "event": event,
        "timestamp": ISO8601DateFormatter().string(from: Date()),
        "data": result
    ]
    guard var bytes = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]) else { return }
    bytes.append(0x0a)
    // Never log screenshots, AX text, typed text or credentials. A diagnostic
    // failure must not turn an already-dispatched action into a retryable error.
    if !FileManager.default.fileExists(atPath: path) {
        guard FileManager.default.createFile(atPath: path, contents: nil,
            attributes: [.posixPermissions: 0o600]) else { return }
    }
    guard let handle = FileHandle(forWritingAtPath: path) else { return }
    defer { try? handle.close() }
    do {
        _ = try handle.seekToEnd()
        try handle.write(contentsOf: bytes)
    } catch { }
}


// Local debugging only: preserve failures before dispatch as well as completion.
// The Sky Perform response remains void. Do not log action text or error messages.
@MainActor
func withNativeMouseInputDiagnostic(
    metadata: [String: Any],
    record: ([String: Any], String) -> Void = { recordNativeInputDiagnostic($0, event: $1) },
    perform: () async throws -> [String: Any]
) async throws -> [String: Any] {
    var context = metadata
    context["attemptId"] = UUID().uuidString
    record(context, "native.input.attempt")
    do {
        let result = try await perform()
        context["outcome"] = result["outcome"]
        context["inputDiagnostics"] = result["inputDiagnostics"]
        record(context, "native.input.completed")
        return result
    } catch {
        context["errorCode"] = (error as? Failure)?.code
            ?? (error is CancellationError ? "CANCELLED" : "NATIVE_INPUT_ERROR")
        record(context, "native.input.failed")
        throw error
    }
}
