import Foundation

@main struct NativeJSONRPCMessageDecoderTests {
    static func main() throws {
        let eof = try NativeJSONRPCMessageDecoder.decode(line: nil)
        precondition(eof == nil)
        let empty = try NativeJSONRPCMessageDecoder.decode(line: "{}")
        precondition(empty?.isEmpty == true)
        let message = try NativeJSONRPCMessageDecoder.decode(line: " {\"id\":\"request\",\"result\":{\"name\":\"应用😀\"},\"extra\":null} \r\n")!
        precondition(message["id"] as? String == "request")
        precondition((message["result"] as? [String: String])?["name"] == "应用😀")
        precondition(message["extra"] is NSNull)
        for value in ["[]", "[1,{}]"] {
            do {
                _ = try NativeJSONRPCMessageDecoder.decode(line: value)
                preconditionFailure("Arrays must not become messages")
            } catch NativeJSONRPCMessageDecoder.DecodeError.invalidResponse {}
        }
        for value in ["", "\n", "{", "not-json", "null", "true", "42", "\"text\"", "{}{}"] {
            do {
                _ = try NativeJSONRPCMessageDecoder.decode(line: value)
                preconditionFailure("Expected Foundation parse failure")
            } catch {
                // Syntax/fragments fail in Foundation and retain its NSError,
                // distinct from a successfully parsed non-dictionary container.
                let original = error as NSError
                precondition(original.domain == NSCocoaErrorDomain)
            }
        }
        print("native JSON-RPC message decoder EOF, objects, Unicode and errors passed")
    }
}
