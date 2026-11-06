import Foundation

private final class ExpectedFailure: Error {}
private final class Connection: NativeAppPolicyConnection {
    var calls = [String]()
    var failureAt: Int?
    let failure = ExpectedFailure()
    var invalidResponse = false
    var closed = 0
    func request(method: String, params: [String: Any]?) async throws -> [String: Any] {
        precondition(closed == 0)
        calls.append(method)
        switch method {
        case "initialize":
            precondition(params?["clientInfo"] as? [String: String] == ["name": "fixture", "version": "1"])
            let caps = params?["capabilities"] as! [String: Any]
            precondition(caps["experimentalApi"] as? Bool == true)
            precondition(caps["optOutNotificationMethods"] as? [String] == [])
            precondition(params?.count == 2 && caps.count == 2)
        case "configRequirements/read": precondition(params == nil)
        case "config/read": precondition(params?.count == 1 && params?["includeLayers"] as? Bool == false)
        default: preconditionFailure("Unexpected request")
        }
        await Task.yield()
        if failureAt == calls.count { throw failure }
        switch method {
        case "initialize": return [:] // Original ignores successful initialize payload.
        case "configRequirements/read": return ["requirements": ["computerUse": ["defaultAppAccess": "deny"]]]
        default: return invalidResponse ? [:] : ["config": [:]]
        }
    }
    func close() { closed += 1 }
}

@main struct NativeAppPolicyFetchTests {
    static func main() async throws {
        let expectedMethods = ["initialize", "configRequirements/read", "config/read"]
        for failureAt in [nil, 1, 2, 3] as [Int?] {
            let connection = Connection()
            connection.failureAt = failureAt
            var created = false
            do {
                let policy = try await NativeAppPolicyFetch.fetch(timeout: 30, makeConnection: { timeout, disablePlugins in
                    precondition(timeout == 30 && !disablePlugins)
                    created = true
                    return connection
                }, clientInfo: {
                    precondition(created)
                    return ["name": "fixture", "version": "1"]
                })
                precondition(failureAt == nil && !policy.allowsApplication(bundleIdentifier: "example.app"))
            } catch {
                precondition(failureAt != nil && error as AnyObject === connection.failure)
            }
            precondition(connection.calls == Array(expectedMethods.prefix(failureAt ?? 3)))
            precondition(connection.closed == 1)
        }
        let invalid = Connection()
        invalid.invalidResponse = true
        do {
            _ = try await NativeAppPolicyFetch.fetch(timeout: 30, makeConnection: { _, _ in invalid },
                clientInfo: { ["name": "fixture", "version": "1"] })
            preconditionFailure("Malformed policy must fail")
        } catch NativeComputerUsePolicy.ParseError.invalidResponse {}
        precondition(invalid.closed == 1 && invalid.calls == expectedMethods)
        let creationFailure = ExpectedFailure()
        do {
            _ = try await NativeAppPolicyFetch.fetch(timeout: 30, makeConnection: { _, _ in throw creationFailure },
                clientInfo: { preconditionFailure("Identity must not be read after connection creation fails") })
            preconditionFailure("Creation error must propagate")
        } catch { precondition(error as AnyObject === creationFailure) }
        print("native policy fetch request order, payloads and failure cleanup passed")
    }
}
