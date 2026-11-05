import Foundation
import Darwin

/// Cooperative SIGTERM/SIGINT cancellation lets native input/clipboard defers run.
/// SIGKILL, crashes and unresponsive native APIs cannot provide this guarantee.
func runNativeService(_ operation: @escaping @Sendable () async throws -> Void) async throws {
    let previousTerm = signal(SIGTERM, SIG_IGN), previousInt = signal(SIGINT, SIG_IGN)
    let task = Task { try await operation() }
    let sources = [SIGTERM, SIGINT].map { number -> DispatchSourceSignal in
        let source = DispatchSource.makeSignalSource(signal:number,queue:.global())
        source.setEventHandler { task.cancel() }
        source.resume()
        return source
    }
    defer {
        for source in sources { source.cancel() }
        signal(SIGTERM,previousTerm); signal(SIGINT,previousInt)
    }
    try await withTaskCancellationHandler(operation: { try await task.value }, onCancel: { task.cancel() })
}

/// Wake idle/fragmented socket operations regularly so signal cancellation reaches cleanup.
func waitForNativeIO(_ fd: Int32, events: Int16) throws {
    while true {
        try Task.checkCancellation()
        var descriptor = pollfd(fd:fd,events:events,revents:0)
        let ready = poll(&descriptor,1,50)
        if ready < 0 && errno == EINTR { continue }
        guard ready >= 0 else { throw fail("PROVIDER_DISCONNECTED","Native socket polling failed") }
        if ready > 0 { try Task.checkCancellation(); return }
    }
}
