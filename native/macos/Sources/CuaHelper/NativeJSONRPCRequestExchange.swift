import Foundation

/// Serial request exchange recovered from 0x100dcdeac..<0x100dcfe4c.
/// Process creation, ownership and caller serialization belong to the connection.
enum NativeJSONRPCRequestExchange {
    enum ResponseError: Error, Equatable {
        case requestRejected(method: String, message: String?)
    }

    static func request(method: String, params: [String: Any]?, input: FileHandle,
                        buffer: NativeJSONRPCLineBuffer, timeout: TimeInterval,
                        isClosed: () -> Bool,
                        notificationHandler: (([String: Any]) async -> Void)? = nil) async throws -> [String: Any] {
        let id = try NativeJSONRPCRequestWriter.send(method: method, params: params,
                                                    to: input, isClosed: isClosed)
        return try await receive(id: id, method: method, timeout: timeout,
            nextMessage: { remaining in
                try await NativeJSONRPCMessageReader.nextMessage(from: buffer, timeout: remaining, method: method)
            }, notificationHandler: notificationHandler)
    }

    /// Clock and message source are host test seams; the source uses Foundation
    /// Date and one shared deadline created after the request has been written.
    static func receive(id: String, method: String, timeout: TimeInterval,
                        now: () -> Date = { Date() },
                        nextMessage: (TimeInterval) async throws -> [String: Any]?,
                        notificationHandler: (([String: Any]) async -> Void)? = nil) async throws -> [String: Any] {
        let deadline = now().addingTimeInterval(timeout)
        while true {
            let remaining = deadline.timeIntervalSince(now())
            guard remaining > 0 else {
                throw NativeJSONRPCMessageReader.ReadError.requestTimedOut(method)
            }
            guard let message = try await nextMessage(remaining) else {
                throw NativeJSONRPCRequestWriter.WriteError.appServerExited
            }
            if let responseID = message["id"] as? String, responseID == id {
                // Presence of error, including JSON null, wins over result.
                if let error = message["error"] {
                    let description: String?
                    if let object = error as? [String: Any] { description = object["message"] as? String }
                    else { description = error as? String }
                    throw ResponseError.requestRejected(method: method, message: description)
                }
                return message["result"] as? [String: Any] ?? [:]
            }
            // The original tests method's type, not absence of id. Even a
            // mismatching response ID with a String method reaches this handler.
            if message["method"] is String, let notificationHandler {
                await notificationHandler(message)
            }
        }
    }
}
