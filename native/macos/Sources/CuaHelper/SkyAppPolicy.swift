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
    init(environment: [String: String] = ProcessInfo.processInfo.environment) throws {
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
    func evaluate(_ reference: String) throws -> [String: Any] {
        let app = try resolveInstalledApp(reference)
        let identifier = app["bundleId"] as! String
        let rule = rules[identifier] ?? SkyAppRule(decision: "denied", risk: "high", allowPersistentApproval: false, warningSubtitle: nil)
        var target: [String: Any] = ["appPath": app["path"]!, "bundleIdentifier": identifier,
            "displayName": app["name"]!, "risk": rule.risk]
        if let warning = rule.warningSubtitle { target["warningSubtitle"] = warning }
        return ["allowPersistentApproval": rule.allowPersistentApproval, "decision": rule.decision, "target": target]
    }
}
