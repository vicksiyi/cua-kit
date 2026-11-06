import Foundation

/// Sending prefix of request(method:params:notificationHandler:),
/// 0x100dcdf24..<0x100dce510. Response matching belongs to the connection.
enum NativeJSONRPCRequestWriter {
    enum WriteError: Error { case appServerExited }

    static func send(method: String, params: [String: Any]?,
                     to handle: FileHandle, isClosed: () -> Bool) throws -> String {
        let id = UUID().uuidString
        var request: [String: Any] = ["id": id, "method": method]
        if let params { request["params"] = params }
        var bytes = try JSONSerialization.data(withJSONObject: request, options: [])
        bytes.append(0x0a)
        // The original samples the close flag after serialization and releases
        // its lock before writing. It does not hold that lock across I/O.
        guard !isClosed() else { throw WriteError.appServerExited }
        try handle.write(contentsOf: bytes)
        return id
    }
}
