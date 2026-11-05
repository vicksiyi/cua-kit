import Foundation
import AppKit
import Darwin

// Independent server for the observed Sky JS wire protocol, not recovered native source.
private let skyVersion = "CodexComputerUseIPC-5"
private let skyFrameLimit = 8_388_608
private struct SkyRPCFailure: Error { let code: Int; let message: String }
private func rpcFailure(_ code: Int, _ message: String) -> SkyRPCFailure { SkyRPCFailure(code: code, message: message) }

@MainActor
private func skyReply(_ data: Data, negotiated: inout Bool, appPolicy: SkyAppPolicy) -> [String: Any] {
    var id: Any = NSNull()
    do {
        guard let request = try JSONSerialization.jsonObject(with: data) as? [String: Any],
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
    } catch {
        return ["id": id, "jsonrpc": "2.0", "error": ["code": -32700, "message": "Invalid JSON payload"]]
    }
}
private func readExact(_ fd: Int32, _ count: Int, allowEOF: Bool = false) throws -> Data? {
    var bytes = [UInt8](repeating: 0, count: count)
    var offset = 0
    while offset < count {
        let amount = bytes.withUnsafeMutableBytes { Darwin.read(fd, $0.baseAddress!.advanced(by: offset), count-offset) }
        if amount < 0 && errno == EINTR { continue }
        if amount == 0 && offset == 0 && allowEOF { return nil }
        guard amount > 0 else { throw rpcFailure(-32600, "Native pipe ended during frame") }
        offset += amount
    }
    return Data(bytes)
}
private func writeAll(_ fd: Int32, _ data: Data) throws {
    var offset = 0
    while offset < data.count {
        let amount = data.withUnsafeBytes { Darwin.write(fd, $0.baseAddress!.advanced(by: offset), data.count-offset) }
        if amount < 0 && errno == EINTR { continue }
        guard amount > 0 else { throw rpcFailure(-32600, "Native pipe write failed") }
        offset += amount
    }
}
/// One private connection per owned process; caller owns service launch/retirement.
/// No vendor endpoint, entitlement or authentication identity is impersonated.
@MainActor
func serveSkySocket(_ path: String) throws {
    let appPolicy = try SkyAppPolicy()
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
    let connection = accept(listener, nil, nil)
    guard connection >= 0 else { throw rpcFailure(-32600, "Cannot accept native connection") }
    defer { Darwin.close(connection) }
    var uid = uid_t(), gid = gid_t()
    guard getpeereid(connection, &uid, &gid) == 0, uid == getuid() else { throw rpcFailure(-10000, "Native peer must belong to the service user") }
    var noSigpipe: Int32 = 1
    guard setsockopt(connection, SOL_SOCKET, SO_NOSIGPIPE, &noSigpipe, socklen_t(MemoryLayout<Int32>.size)) == 0 else { throw rpcFailure(-32600, "Cannot configure native connection") }
    var negotiated = false
    while let header = try readExact(connection, 4, allowEOF: true) {
        let size = header.enumerated().reduce(0) { $0 | Int($1.element) << (8 * $1.offset) }
        guard size > 0 && size <= skyFrameLimit else { throw rpcFailure(-32600, "Invalid native frame length") }
        let body = try readExact(connection, size)!
        let response = try JSONSerialization.data(withJSONObject: skyReply(body, negotiated: &negotiated, appPolicy: appPolicy), options: [.sortedKeys])
        guard response.count <= skyFrameLimit else { throw rpcFailure(-32600, "Native reply exceeds frame limit") }
        let length = UInt32(response.count)
        let prefix = Data((0..<4).map { UInt8(truncatingIfNeeded: length >> (8 * $0)) })
        try writeAll(connection, prefix + response)
    }
}
