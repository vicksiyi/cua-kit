import Foundation

/// Native policy result follows the observed Sky client contract. Rule storage and
/// defaults below are explicit standalone deployment policy, not vendor defaults.
struct SkyAppRule: Codable {
    let decision: String
    let risk: String
    let allowPersistentApproval: Bool
    let warningSubtitle: String?
}
struct SkyAppPolicy {
    let rules: [String: SkyAppRule]
    private let nativeEvaluation: NativeAppPolicyEvaluation?

    /// Explicit host wiring for the restored provider. Existing environment
    /// policy remains the default; this initializer does not modify its rules.
    @MainActor
    init(provider: NativeAppPolicyProvider) {
        rules = [:]
        nativeEvaluation = NativeAppPolicyEvaluation(
            resolve: { try NativeApplicationResolution.system().resolve($0) },
            loadPolicy: { try await provider.policy() })
    }

    init(environment: [String: String] = ProcessInfo.processInfo.environment) throws {
        nativeEvaluation = nil
        let encoded = environment["CORE_CUA_APP_POLICY"] ?? "{}"
        guard encoded.utf8.count <= 65_536, let data = encoded.data(using: .utf8) else {
            throw fail("INVALID_ARGUMENT", "Native app policy exceeds its configuration limit.")
        }
        rules = try JSONDecoder().decode([String: SkyAppRule].self, from: data)
        for (identifier, rule) in rules {
            guard !identifier.isEmpty, ["allowed", "denied", "forbidden"].contains(rule.decision),
                  ["high", "low"].contains(rule.risk) else {
                throw fail("INVALID_ARGUMENT", "Invalid native app policy rule.")
            }
        }
    }
    @MainActor
    func evaluate(_ reference: String) async throws -> [String: Any] {
        if let nativeEvaluation {
            do { return try await nativeEvaluation.evaluate(reference).ipcObject }
            catch let error as NativeApplicationResolution.BundleIDLookupError {
                switch error {
                case .notFound: throw SkyRPCFailure(code: -10010, message: reference)
                case .ambiguous: throw SkyRPCFailure(code: -10018, message: error.description)
                }
            }
        }
        let app: [String: Any]
        do { app = try resolveInstalledApp(reference) }
        catch let error as Failure where error.code == "AMBIGUOUS_TARGET" {
            throw SkyRPCFailure(code: -10018, message: error.message)
        }
        catch { throw SkyRPCFailure(code: -10010, message: reference) }
        let identifier = app["bundleId"] as! String
        let rule = rules[identifier] ?? SkyAppRule(decision: "denied", risk: "high", allowPersistentApproval: false, warningSubtitle: nil)
        var target: [String: Any] = ["appPath": app["path"]!, "bundleIdentifier": identifier,
            "displayName": app["name"]!, "risk": rule.risk]
        if let warning = rule.warningSubtitle { target["warningSubtitle"] = warning }
        return ["allowPersistentApproval": rule.allowPersistentApproval, "decision": rule.decision, "target": target]
    }
}
