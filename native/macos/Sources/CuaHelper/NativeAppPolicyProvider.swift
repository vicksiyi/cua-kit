import Foundation

/// Composition of the restored provider cache, three-request fetch and owned
/// subprocess connection. Launch resolution and honest host identity are
/// injected; constructing this provider neither launches nor changes policy.
struct NativeAppPolicyProvider: Sendable {
    private let cache: NativeAppPolicyCache<NativeComputerUsePolicy>

    init(now: @escaping @Sendable () -> Date = { Date() },
         resolveLaunch: @escaping @Sendable () throws -> NativeCLILaunchConfiguration,
         clientInfo: @escaping @Sendable () -> [String: String]) {
        cache = NativeAppPolicyCache(now: now) { timeout in
            try await NativeAppPolicyFetch.fetch(timeout: timeout,
                makeConnection: { timeout, disablePlugins in
                    let launch = try resolveLaunch()
                    return try NativeJSONRPCConnection(executableURL: launch.executableURL,
                        arguments: launch.appServerArguments(disablePlugins: disablePlugins), timeout: timeout)
                }, clientInfo: clientInfo)
        }
    }

    func policy() async throws -> NativeComputerUsePolicy { try await cache.policy() }
}

enum NativeAppServerClientInfo {
    /// Version selection recovered from 0x100dd1864..<0x100dd1b68.
    /// Name/title intentionally identify the host, not the vendor implementation.
    static func make(name: String, title: String,
                     readInfo: (String) -> Any? = { Bundle.main.object(forInfoDictionaryKey: $0) }) -> [String: String] {
        let version = (readInfo("CFBundleShortVersionString") as? String)
            ?? (readInfo("CFBundleVersion") as? String) ?? "unknown"
        return ["name": name, "title": title, "version": version]
    }
}
