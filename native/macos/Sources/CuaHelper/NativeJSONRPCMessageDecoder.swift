import Foundation

/// JSON decoding tail of nextMessage at 0x100dd0740..<0x100dd0958.
/// Line acquisition, timeout racing and response-ID dispatch are separate.
enum NativeJSONRPCMessageDecoder {
    // Host error representation of the original invalidResponse case.
    enum DecodeError: Error { case invalidResponse }

    static func decode(line: String?) throws -> [String: Any]? {
        guard let line else { return nil }
        // Do not ignore malformed/blank lines, unwrap result, or validate JSON-RPC
        // fields here: the source only requires a JSON dictionary at this stage.
        let value = try JSONSerialization.jsonObject(with: Data(line.utf8), options: [])
        guard let message = value as? [String: Any] else { throw DecodeError.invalidResponse }
        return message
    }
}
