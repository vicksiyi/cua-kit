import AppKit
import Foundation

extension SkyAppPolicy {
    /// Standalone service configuration, not a recovered vendor setting.
    /// Selecting a source is explicit; a second configured rules source must
    /// never be silently discarded by enabling the subprocess provider.
    @MainActor
    static func bootstrap(environment: [String: String] = ProcessInfo.processInfo.environment) throws -> SkyAppPolicy {
        switch environment["CORE_CUA_POLICY_SOURCE"] ?? "standalone" {
        case "standalone": return try SkyAppPolicy(environment: environment)
        case "app-server":
            guard environment["CORE_CUA_APP_POLICY"] == nil else {
                throw fail("INVALID_ARGUMENT", "CORE_CUA_POLICY_SOURCE=app-server conflicts with CORE_CUA_APP_POLICY; choose one policy source.")
            }
            let identity = NativeAppServerClientInfo.make(name: "core-computer-use", title: "Core Computer Use")
            let provider = NativeAppPolicyProvider(resolveLaunch: {
                await MainActor.run {
                    let applications = NSWorkspace.shared.runningApplications.map {
                        NativeCLIExecutableLocator.RunningApplication(bundleIdentifier: $0.bundleIdentifier, bundleURL: $0.bundleURL)
                    }
                    return NativeCLIExecutableLocator.launchConfiguration(environment: environment,
                        runningApplications: applications, fallbackBundleURLs: [])
                }
            }, clientInfo: { identity })
            return SkyAppPolicy(provider: provider)
        default:
            throw fail("INVALID_ARGUMENT", "CORE_CUA_POLICY_SOURCE must be standalone or app-server.")
        }
    }
}
