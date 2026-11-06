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
        print("native policy parser defaults, conjunction, strict types and separate rule maps passed")
    }
}
