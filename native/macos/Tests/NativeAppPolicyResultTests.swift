import Foundation

@main struct NativeAppPolicyResultTests {
    static func main() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }
        let app = root.appendingPathComponent("名字 with space.app", isDirectory: true)
        try fm.createDirectory(at: app, withIntermediateDirectories: true)
        let alias = root.appendingPathComponent("alias.app")
        try fm.createSymbolicLink(at: alias, withDestinationURL: app)
        let target = NativeApplicationTarget(bundleIdentifier: "example.fixture", bundleURL: alias)
        // URL directory hints may retain a trailing slash; identifier removes it.
        let expectedPath = root.resolvingSymlinksInPath().standardizedFileURL.path + "/名字 with space.app"
        precondition(target.identifier == expectedPath)
        precondition(target.bundleURL.resolvingSymlinksInPath().standardizedFileURL.path == app.resolvingSymlinksInPath().standardizedFileURL.path)
        precondition(NativeApplicationTarget.identifier(for: URL(fileURLWithPath: "/")) == "/")
        precondition(!target.identifier.contains("%20"))
        let policy = try NativeComputerUsePolicy.parse(requirementsResponse: ["requirements": NSNull()],
                                                       configResponse: ["config": [:]])
        for (first, second, expected, keys): (Any?, Any?, String, [String]) in [
            ("Display", "Name", "Display", ["CFBundleDisplayName"]),
            ("", "Name", "", ["CFBundleDisplayName"]),
            (nil, "Name", "Name", ["CFBundleDisplayName", "CFBundleName"]),
            (1, NSNull(), "名字 with space", ["CFBundleDisplayName", "CFBundleName"]),
        ] {
            var calls = [String]()
            let result = NativeAppPolicyResult(policy: policy, target: target, readBundleValue: { key in
                calls.append(key); return key == "CFBundleDisplayName" ? first : second
            }, supportsHTTPScheme: { calls.append("http"); return false }, isForbiddenTarget: { _ in
                calls.append("forbidden"); return false
            })
            precondition(calls == ["forbidden"] + keys + ["http"])
            precondition(result.displayName == expected && result.appPath == target.identifier)
            let decoded = try JSONSerialization.jsonObject(with: JSONSerialization.data(withJSONObject: result.ipcObject)) as! [String: Any]
            precondition(decoded["decision"] as? String == "allowed")
            precondition(decoded["allowPersistentApproval"] as? Bool == true)
            let object = decoded["target"] as! [String: Any]
            precondition(object["risk"] as? String == "low" && object["warningSubtitle"] == nil)
        }
        let concrete = NativeAppPolicyResult(policy: policy, target: target)
        precondition(concrete.displayName == "名字 with space")
        // Denied results still describe the target and risk; they do not skip
        // descriptor construction or silently change persistence choices.
        let deniedPolicy = try NativeComputerUsePolicy.parse(requirementsResponse: ["requirements": ["allowBrowserAndComputerUse": false]], configResponse: ["config": [:]])
        let denied = NativeAppPolicyResult(policy: deniedPolicy, target: target,
            readBundleValue: { _ in nil }, supportsHTTPScheme: { true },
            isForbiddenTarget: { _ in preconditionFailure("Policy denial must precede classifier") })
        precondition(denied.decision == .denied && denied.approval.risk == .high)
        precondition(denied.approval.warningSubtitle != nil && denied.approval.allowPersistentApproval)
        print("native policy result canonical paths, display-name fallback, ordering and IPC projection passed")
    }
}
