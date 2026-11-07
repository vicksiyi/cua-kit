import Foundation
import ApplicationServices

struct Failure: Error { let code: String; let message: String }
func fail(_ code: String, _ message: String) -> Failure { Failure(code: code, message: message) }
private struct FixtureError: Error, CustomStringConvertible {
    var description: String { "fixture runtime failure" }
}
@MainActor func handle(_ method: String, _ params: [String: Any]) async throws -> [String: Any] {
    switch method {
    case "hello": return ["protocolVersion": 1, "platform": "macos", "capabilities": [], "permissions": ["accessibility": false, "screenRecording": false]]
    case "ax": throw UIElementError.axError(.cannotComplete)
    case "host": throw fail("STALE_OBSERVATION", "fixture stale observation")
    case "runtime": throw FixtureError()
    default: return ["alive": true]
    }
}
@main struct NativeStdioErrorFixture {
    static func main() async throws { try await serveNativeStdio() }
}
