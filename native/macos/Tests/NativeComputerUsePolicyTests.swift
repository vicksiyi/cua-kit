import Foundation

@main struct NativeComputerUsePolicyTests {
    static func parse(_ requirements: Any = NSNull(), _ config: Any = [String: Any]()) throws -> NativeComputerUsePolicy {
        try .parse(requirementsResponse: ["requirements": requirements], configResponse: ["config": config])
    }
    static func rejects(_ operation: () throws -> Void) {
        do { try operation(); preconditionFailure("Expected invalid response") }
        catch NativeComputerUsePolicy.ParseError.invalidResponse { }
        catch { preconditionFailure("Unexpected error: \(error)") }
    }
    static func main() throws {
        let defaults = try parse()
        precondition(defaults.allowComputerUse && defaults.allowPersistentApproval)
        precondition(defaults.macos.defaultAppAccess == .allow && defaults.configuredMacOS.defaultAppAccess == .allow)
        precondition(defaults.macos.bundleIDs.isEmpty && defaults.configuredMacOS.bundleIDs.isEmpty)
        rejects { _ = try NativeComputerUsePolicy.parse(requirementsResponse: [:], configResponse: ["config": [:]]) }
        rejects { _ = try parse(NSNull(), NSNull()) }
        for a in [false, true] { for b in [false, true] { for c in [false, true] {
            let p = try parse(["allowBrowserAndComputerUse": a, "featureRequirements": ["computer_use": b]],
                              ["features": ["computer_use": c]])
            precondition(p.allowComputerUse == (a && b && c))
        } } }
        for bad: Any in [0, 1, NSNumber(value: 1), "true", [], ["x": true]] {
            rejects { _ = try parse(["allowBrowserAndComputerUse": bad]) }
            rejects { _ = try parse(["allowBrowserAndComputerUse": false, "featureRequirements": ["computer_use": bad]]) }
        }
        for bad: Any in [false, 1, "{}", [1]] {
            rejects { _ = try parse(bad) }
            rejects { _ = try parse(["computerUse": ["macos": bad]]) }
        }
        let p = try parse(["computerUse": ["allowPersistentApproval": false, "defaultAppAccess": "deny",
                                           "macos": ["bundleIds": ["app.A": "allow", "": "deny"]]]],
                          ["computer_use": ["default_app_access": "allow", "macos": ["bundle_ids": ["app.A": "deny"]]]])
        precondition(!p.allowPersistentApproval && p.macos.defaultAppAccess == .deny)
        precondition(p.macos.bundleIDs == ["app.A": .allow, "": .deny])
        precondition(p.configuredMacOS.bundleIDs == ["app.A": .deny])
        // Wrong-case keys are not aliases; the two sources remain separate.
        let ignored = try parse(["computerUse": ["macos": ["defaultAppAccess": "deny", "bundleIDs": ["x": "deny"]]]])
        precondition(ignored == defaults)
        for bad: Any in ["ALLOW", "unknown", false, 1, ["x"]] {
            rejects { _ = try parse(["computerUse": ["defaultAppAccess": bad]]) }
            rejects { _ = try parse(["computerUse": ["macos": ["bundleIds": ["x": bad]]]]) }
        }
        rejects { _ = try parse(["computerUse": ["macos": ["bundleIds": ["x": NSNull()]]]]) }
        let json = try JSONSerialization.jsonObject(with: Data("{\"requirements\":{\"allowBrowserAndComputerUse\":false}}".utf8)) as! [String: Any]
        let bridged = try NativeComputerUsePolicy.parse(requirementsResponse: json, configResponse: ["config": [:]])
        precondition(!bridged.allowComputerUse)
        // Global switch × both defaults × both optional overrides. An explicit
        // allow only overrides its own layer's default, never the other layer.
        let accesses: [NativeComputerUsePolicy.AppAccess] = [.allow, .deny]
        let overrides: [NativeComputerUsePolicy.AppAccess?] = [nil, .allow, .deny]
        var cases = 0
        for global in [false, true] {
            for requiredDefault in accesses { for configuredDefault in accesses {
                for requiredOverride in overrides { for configuredOverride in overrides {
                    let requiredRules = requiredOverride.map { ["app.A": $0] } ?? [:]
                    let configuredRules = configuredOverride.map { ["app.A": $0] } ?? [:]
                    let policy = NativeComputerUsePolicy(allowComputerUse: global, allowPersistentApproval: false,
                        macos: .init(defaultAppAccess: requiredDefault, bundleIDs: requiredRules),
                        configuredMacOS: .init(defaultAppAccess: configuredDefault, bundleIDs: configuredRules))
                    let expected = global && (requiredOverride ?? requiredDefault) == .allow
                        && (configuredOverride ?? configuredDefault) == .allow
                    precondition(policy.allowsApplication(bundleIdentifier: "app.A") == expected)
                    for forbidden in [false, true] {
                        var classifierCalls = 0
                        let decision = policy.decision(bundleIdentifier: "app.A") { identifier in
                            precondition(identifier == "app.A")
                            classifierCalls += 1
                            return forbidden
                        }
                        precondition(classifierCalls == (expected ? 1 : 0))
                        precondition(decision == (expected ? (forbidden ? .forbidden : .allowed) : .denied))
                    }
                    cases += 1
                } }
            } }
        }
        precondition(cases == 72)
        let exact = NativeComputerUsePolicy(allowComputerUse: true, allowPersistentApproval: true,
            macos: .init(defaultAppAccess: .deny, bundleIDs: ["app.A": .allow, "app.*": .allow]),
            configuredMacOS: .init(defaultAppAccess: .allow, bundleIDs: [:]))
        precondition(exact.allowsApplication(bundleIdentifier: "app.A"))
        for mismatch in ["app.a", " app.A", "app.A.child", "app.B"] {
            precondition(!exact.allowsApplication(bundleIdentifier: mismatch))
        }
        print("native policy parser defaults, conjunction, strict types and separate rule maps passed")
        print("72 app access combinations and forbidden classifier ordering passed")
        let forbidden = NativeForbiddenTargets.terminals + NativeForbiddenTargets.codex
            + NativeForbiddenTargets.chatGPT + NativeForbiddenTargets.systemAuthentication
        precondition(forbidden.count == 24 && Set(forbidden).count == 24)
        for identifier in forbidden {
            precondition(NativeForbiddenTargets.contains(identifier))
            precondition(defaults.decisionWithDefaultTargetClassification(bundleIdentifier: identifier) == .forbidden)
            precondition(!NativeForbiddenTargets.contains(identifier + ".child"))
            precondition(!NativeForbiddenTargets.contains(" " + identifier))
            precondition(!NativeForbiddenTargets.contains(identifier.uppercased()))
        }
        precondition(defaults.decisionWithDefaultTargetClassification(bundleIdentifier: "example.fixture") == .allowed)
        precondition(exact.decisionWithDefaultTargetClassification(bundleIdentifier: "com.apple.Terminal") == .denied)
        print("24 normal forbidden targets and exact-match boundaries passed")
    }
}
