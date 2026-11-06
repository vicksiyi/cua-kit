import Foundation

/// Host protocol exposing the original connection operations used by policy
/// fetching. Concrete subprocess/wire transport is reconstructed separately.
protocol NativeAppPolicyConnection: AnyObject {
    func request(method: String, params: [String: Any]?) async throws -> [String: Any]
    func close()
}

enum NativeAppPolicyFetch {
    /// Native provider flow at 0x1000aa444..<0x1000aab28. The caller supplies
    /// client identity; this helper does not pretend to be the vendor client.
    static func fetch(timeout: TimeInterval,
                      makeConnection: (TimeInterval, Bool) throws -> any NativeAppPolicyConnection,
                      clientInfo: () -> [String: String]) async throws -> NativeComputerUsePolicy {
        let connection = try makeConnection(timeout, false)
        defer { connection.close() }
        _ = try await connection.request(method: "initialize", params: [
            "clientInfo": clientInfo(),
            "capabilities": ["experimentalApi": true, "optOutNotificationMethods": [String]()],
        ])
        let requirements = try await connection.request(method: "configRequirements/read", params: nil)
        let configuration = try await connection.request(method: "config/read", params: ["includeLayers": false])
        return try NativeComputerUsePolicy.parse(requirementsResponse: requirements, configResponse: configuration)
    }
}
