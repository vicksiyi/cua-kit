import Foundation
import AppKit
import Darwin

// Independent server for the observed Sky JS wire protocol, not recovered native source.
private let skyVersion = "CodexComputerUseIPC-5"
private let skyFrameLimit = 8_388_608
struct SkyRPCFailure: Error { let code: Int; let message: String }
private func rpcFailure(_ code: Int, _ message: String) -> SkyRPCFailure { SkyRPCFailure(code: code, message: message) }

@MainActor
private func skyReply(_ data: Data, negotiated: inout Bool, appPolicy: SkyAppPolicy, appState: SkyAppState) async -> [String: Any] {
    var id: Any = NSNull()
    do {
        let decoded: Any
        do { decoded = try JSONSerialization.jsonObject(with: data) }
        catch { throw rpcFailure(-32700, "Invalid JSON payload") }
        guard let request = decoded as? [String: Any],
              request["jsonrpc"] as? String == "2.0",
              let number = request["id"] as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite,
              let method = request["method"] as? String,
              let params = request["params"] as? [String: Any] else { throw rpcFailure(-32600, "Invalid JSON-RPC request") }
        id = number
        guard params["clientApiVersion"] as? String == skyVersion else { throw rpcFailure(-10013, "Incompatible Computer Use client version") }
        let result: Any
        switch method {
        case "ping":
            negotiated = true
            result = ["serverApiVersion": skyVersion]
        case "request":
            guard negotiated else { throw rpcFailure(-32600, "A successful ping is required before requests") }
            guard let deadline = params["deadlineUnixMilliseconds"] as? NSNumber,
                  CFGetTypeID(deadline) != CFBooleanGetTypeID(), deadline.doubleValue.isFinite,
                  deadline.doubleValue > Date().timeIntervalSince1970 * 1000,
                  let type = params["requestType"] as? String,
                  params["request"] is [String: Any] else { throw rpcFailure(-32602, "Invalid or expired Computer Use request") }
            switch type {
            case "ComputerUseIPCListAppsRequest":
                result = NSWorkspace.shared.runningApplications.filter { $0.activationPolicy != .prohibited }.map { app -> [String: Any] in
                    var value: [String: Any] = ["isRunning": !app.isTerminated, "isFrontmost": app.isActive]
                    if let name = app.localizedName { value["displayName"] = name }
                    if let bundle = app.bundleIdentifier { value["bundleIdentifier"] = bundle }
                    if let path = app.bundleURL?.path { value["appPath"] = path }
                    return value
                }
            case "ComputerUseIPCAppPerformActionRequest":
                let payload = params["request"] as! [String: Any]
                guard let app = payload["app"] as? String, !app.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                      let action = payload["action"] as? [String: Any] else {
                    throw rpcFailure(-32602, "App action requires app and action fields")
                }
                try await appState.perform(app, action: action, policy: appPolicy, deadline: deadline.doubleValue)
                result = NSNull()
            case "ComputerUseIPCAppStartRequest":
                let payload = params["request"] as! [String: Any]
                guard let app = payload["app"] as? String, !app.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    throw rpcFailure(-32602, "App start requires a non-empty app reference")
                }
                result = try await appState.start(app, policy: appPolicy, deadline: deadline.doubleValue)
            case "ComputerUseIPCAppGetSkyshotRequest":
                let payload = params["request"] as! [String: Any]
                guard let app = payload["app"] as? String, !app.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    throw rpcFailure(-32602, "App skyshot requires a non-empty app reference")
                }
                if let value = payload["disableDiff"] {
                    guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else {
                        throw rpcFailure(-32602, "disableDiff must be a boolean")
                    }
                }
                result = try await appState.get(app, policy: appPolicy, deadline: deadline.doubleValue)
            case "ComputerUseIPCAppPolicyRequest":
                let payload = params["request"] as! [String: Any]
                guard let app = payload["app"] as? String, !app.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    throw rpcFailure(-32602, "App policy requires a non-empty app reference")
                }
                do { result = try appPolicy.evaluate(app) }
                catch { throw rpcFailure(-10010, "Installed application could not be resolved") }
            default:
                throw rpcFailure(-10003, "Computer Use request type is not implemented by this independent service")
            }
        default: throw rpcFailure(-32601, "Unknown JSON-RPC method")
        }
        return ["id": id, "jsonrpc": "2.0", "result": result]
    } catch let error as SkyRPCFailure {
        return ["id": id, "jsonrpc": "2.0", "error": ["code": error.code, "message": error.message]]
    } catch let error as Failure {
        let code: Int
        switch error.code {
        case "PERMISSION_DENIED": code = -10009
        case "TARGET_NOT_FOUND": code = -10007
        case "AMBIGUOUS_TARGET": code = -10018
        case "INVALID_ARGUMENT": code = -32602
        case "STALE_OBSERVATION", "PROVIDER_DISCONNECTED": code = -10008
        default: code = -10005
        }
        return ["id": id, "jsonrpc": "2.0", "error": ["code": code, "message": error.message]]
    } catch {
        return ["id": id, "jsonrpc": "2.0", "error": ["code": -10005, "message": "Native request failed: \(error.localizedDescription)"]]
    }
}
private func readExact(_ fd: Int32, _ count: Int, allowEOF: Bool = false) throws -> Data? {
    var bytes = [UInt8](repeating: 0, count: count)
    var offset = 0
    while offset < count {
        try waitForNativeIO(fd,events:Int16(POLLIN))
        let amount = bytes.withUnsafeMutableBytes { Darwin.read(fd, $0.baseAddress!.advanced(by: offset), count-offset) }
        if amount < 0 && [EINTR,EAGAIN,EWOULDBLOCK].contains(errno) { continue }
        if amount == 0 && offset == 0 && allowEOF { return nil }
        guard amount > 0 else { throw rpcFailure(-32600, "Native pipe ended during frame") }
        offset += amount
    }
    return Data(bytes)
}
private func writeAll(_ fd: Int32, _ data: Data) throws {
    var offset = 0
    while offset < data.count {
        try waitForNativeIO(fd,events:Int16(POLLOUT))
        let amount = data.withUnsafeBytes { Darwin.write(fd, $0.baseAddress!.advanced(by: offset), data.count-offset) }
        if amount < 0 && [EINTR,EAGAIN,EWOULDBLOCK].contains(errno) { continue }
        guard amount > 0 else { throw rpcFailure(-32600, "Native pipe write failed") }
        offset += amount
    }
}
/// One private connection per owned process; caller owns service launch/retirement.
/// No vendor endpoint, entitlement or authentication identity is impersonated.
func serveSkySocket(_ path: String) async throws {
    let appPolicy = try SkyAppPolicy()
    let appState = await SkyAppState()
    guard path.hasPrefix("/"), !path.utf8.contains(0) else { throw rpcFailure(-32602, "Expected an absolute socket path") }
    let parent = URL(fileURLWithPath: path).deletingLastPathComponent().resolvingSymlinksInPath().path
    var metadata = stat()
    guard lstat(parent, &metadata) == 0, metadata.st_mode & S_IFMT == S_IFDIR,
          metadata.st_uid == getuid(), metadata.st_mode & 0o077 == 0 else { throw rpcFailure(-32602, "Socket parent must be a private owned directory") }
    let canonical = URL(fileURLWithPath: parent).appendingPathComponent(URL(fileURLWithPath: path).lastPathComponent).path
    let bytes = Array(canonical.utf8) + [0]
    var address = sockaddr_un()
    guard bytes.count <= MemoryLayout.size(ofValue: address.sun_path) else { throw rpcFailure(-32602, "Native socket path is too long") }
    address.sun_family = sa_family_t(AF_UNIX)
    address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
    withUnsafeMutableBytes(of: &address.sun_path) { buffer in buffer.copyBytes(from: bytes) }
    let listener = socket(AF_UNIX, SOCK_STREAM, 0)
    guard listener >= 0 else { throw rpcFailure(-32600, "Cannot create native socket") }
    defer { Darwin.close(listener) }
    let bound = withUnsafePointer(to: &address) { pointer in pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(listener, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) } }
    guard bound == 0 else { throw rpcFailure(-32600, "Cannot bind native socket; existing paths are never replaced") }
    defer { unlink(canonical) }
    guard chmod(canonical, 0o600) == 0, listen(listener, 1) == 0 else { throw rpcFailure(-32600, "Cannot initialize private native socket") }
    let ready = try JSONSerialization.data(withJSONObject: ["type":"sky_service_ready", "socketPath":canonical], options: [.sortedKeys])
    FileHandle.standardOutput.write(ready + Data([10]))
    try waitForNativeIO(listener,events:Int16(POLLIN))
    let connection = accept(listener, nil, nil)
    guard connection >= 0 else { throw rpcFailure(-32600, "Cannot accept native connection") }
    defer { Darwin.close(connection) }
    let flags = fcntl(connection,F_GETFL)
    guard flags >= 0, fcntl(connection,F_SETFL,flags | O_NONBLOCK) == 0 else { throw rpcFailure(-32600,"Cannot configure cancellable native socket") }
    var uid = uid_t(), gid = gid_t()
    guard getpeereid(connection, &uid, &gid) == 0, uid == getuid() else { throw rpcFailure(-10000, "Native peer must belong to the service user") }
    var noSigpipe: Int32 = 1
    guard setsockopt(connection, SOL_SOCKET, SO_NOSIGPIPE, &noSigpipe, socklen_t(MemoryLayout<Int32>.size)) == 0 else { throw rpcFailure(-32600, "Cannot configure native connection") }
    var negotiated = false
    while let header = try readExact(connection, 4, allowEOF: true) {
        let size = header.enumerated().reduce(0) { $0 | Int($1.element) << (8 * $1.offset) }
        guard size > 0 && size <= skyFrameLimit else { throw rpcFailure(-32600, "Invalid native frame length") }
        let body = try readExact(connection, size)!
        let reply = await skyReply(body, negotiated: &negotiated, appPolicy: appPolicy, appState: appState)
        let response = try JSONSerialization.data(withJSONObject: reply, options: [.sortedKeys])
        guard response.count <= skyFrameLimit else { throw rpcFailure(-32600, "Native reply exceeds frame limit") }
        let length = UInt32(response.count)
        let prefix = Data((0..<4).map { UInt8(truncatingIfNeeded: length >> (8 * $0)) })
        try writeAll(connection, prefix + response)
    }
}

// Integration fixture: saturate a private socketpair, then exercise the same
// production writer while the receiving endpoint deliberately does not read.
func runSocketBackpressureFixture() throws {
    var pair: [Int32] = [0,0]
    guard socketpair(AF_UNIX,SOCK_STREAM,0,&pair) == 0 else { throw fail("SELF_TEST_FAILED","Cannot create fixture socketpair") }
    defer { for fd in pair { Darwin.close(fd) } }
    let sender = pair[0]
    var capacity: Int32 = 4096
    guard setsockopt(sender,SOL_SOCKET,SO_SNDBUF,&capacity,socklen_t(MemoryLayout<Int32>.size)) == 0,
          fcntl(sender,F_SETFL,fcntl(sender,F_GETFL) | O_NONBLOCK) == 0 else {
        throw fail("SELF_TEST_FAILED","Cannot configure fixture socket")
    }
    let block = Data(repeating:65,count:4096)
    var total = 0
    while true {
        let amount = block.withUnsafeBytes { Darwin.write(sender,$0.baseAddress!,block.count) }
        if amount < 0 && [EAGAIN,EWOULDBLOCK].contains(errno) { break }
        if amount < 0 && errno == EINTR { continue }
        guard amount > 0, total < 1_048_576 else { throw fail("SELF_TEST_FAILED","Socket did not reach backpressure") }
        total += amount
    }
    print("{\"socketBackpressureReady\":true}"); fflush(stdout)
    do {
        try writeAll(sender,block)
        throw fail("SELF_TEST_FAILED","Backpressured write unexpectedly completed")
    } catch is CancellationError {
        print("{\"socketBackpressureCancelled\":true}"); fflush(stdout)
        throw CancellationError()
    }
}
