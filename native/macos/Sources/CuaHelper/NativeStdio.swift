import Foundation
import Darwin

// Compatibility transport only. Original Sky uses the separate framed socket service.
// Nonblocking I/O permits cooperative cancellation even with a partial line or full output pipe.
@MainActor
func serveNativeStdio() async throws {
    let inputFlags = fcntl(STDIN_FILENO,F_GETFL)
    let outputFlags = fcntl(STDOUT_FILENO,F_GETFL)
    guard inputFlags >= 0, outputFlags >= 0 else { throw fail("PROVIDER_DISCONNECTED","Cannot inspect native stdio") }
    guard fcntl(STDIN_FILENO,F_SETFL,inputFlags | O_NONBLOCK) == 0 else { throw fail("PROVIDER_DISCONNECTED","Cannot configure native input") }
    defer { _ = fcntl(STDIN_FILENO,F_SETFL,inputFlags) }
    guard fcntl(STDOUT_FILENO,F_SETFL,outputFlags | O_NONBLOCK) == 0 else { throw fail("PROVIDER_DISCONNECTED","Cannot configure native output") }
    let previousPipe = signal(SIGPIPE,SIG_IGN)
    defer { _ = fcntl(STDOUT_FILENO,F_SETFL,outputFlags); signal(SIGPIPE,previousPipe) }
    var pending = Data()
    var chunk = [UInt8](repeating:0,count:8192)
    let limit = 1024*1024
    func reply(_ line: Data) async throws {
        try Task.checkCancellation()
        var id: Any = NSNull()
        var response: [String:Any]
        do {
            let decoded: Any
            do { decoded = try JSONSerialization.jsonObject(with: line) }
            catch { throw fail("INVALID_ARGUMENT", "Invalid JSON request.") }
            guard let request = decoded as? [String:Any],
                  let requestId = request["id"] as? String, let method = request["method"] as? String else {
                throw fail("INVALID_ARGUMENT","Expected JSON request with string id/method.")
            }
            id = requestId
            response = ["id":id,"result":try await handle(method,request["params"] as? [String:Any] ?? [:])]
        } catch is CancellationError { throw CancellationError() }
          catch let error as Failure { response = ["id":id,"error":["code":error.code,"message":error.message]] }
          catch UIElementError.axError(let status) {
            response = ["id": id, "error": ["code": "ACCESSIBILITY_ERROR",
                "message": "Accessibility error: \(NativeAXErrorDescription.describe(status)) (\(status.rawValue))"]]
          }
          catch { response = ["id":id,"error":["code":"NATIVE_ERROR","message":String(describing: error)]] }
        var bytes = try JSONSerialization.data(withJSONObject:response,options:[.sortedKeys]); bytes.append(10)
        var offset = 0
        while offset < bytes.count {
            try waitForNativeIO(STDOUT_FILENO,events:Int16(POLLOUT))
            let count = bytes.withUnsafeBytes { Darwin.write(STDOUT_FILENO,$0.baseAddress!.advanced(by:offset),bytes.count-offset) }
            if count < 0 && [EINTR,EAGAIN,EWOULDBLOCK].contains(errno) { continue }
            guard count > 0 else { throw fail("PROVIDER_DISCONNECTED","Native output closed") }
            offset += count
        }
    }
    while true {
        try waitForNativeIO(STDIN_FILENO,events:Int16(POLLIN))
        let count = Darwin.read(STDIN_FILENO,&chunk,chunk.count)
        if count < 0 && [EINTR,EAGAIN,EWOULDBLOCK].contains(errno) { continue }
        guard count >= 0 else { throw fail("PROVIDER_DISCONNECTED","Native input failed") }
        if count == 0 {
            if !pending.isEmpty { try await reply(pending) }
            return
        }
        pending.append(contentsOf:chunk.prefix(count))
        while let newline = pending.firstIndex(of:10) {
            let length = pending.distance(from:pending.startIndex,to:newline)
            guard length <= limit else { throw fail("INVALID_ARGUMENT","Native request exceeds line budget") }
            let line = Data(pending.prefix(length)); pending.removeFirst(length+1)
            try await reply(line)
        }
        guard pending.count <= limit else { throw fail("INVALID_ARGUMENT","Native request exceeds line budget") }
    }
}
