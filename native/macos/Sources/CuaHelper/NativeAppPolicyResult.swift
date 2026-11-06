import Foundation

/// Composes the recovered app-policy result after resolution and policy fetch.
/// No launch, approval, or policy persistence occurs in result construction.
struct NativeAppPolicyResult {
    let decision: NativeComputerUsePolicy.Decision
    let appPath: String
    let bundleIdentifier: String
    let displayName: String
    let approval: NativePolicyApprovalMetadata

    init(policy: NativeComputerUsePolicy, target: NativeApplicationTarget,
         readBundleValue: (String) -> Any?, supportsHTTPScheme: () -> Bool,
         isForbiddenTarget: (String) -> Bool = NativeForbiddenTargets.contains) {
        // Preserve source order: access/classification, display name, risk.
        let decision = policy.decision(bundleIdentifier: target.bundleIdentifier,
                                       isForbiddenTarget: isForbiddenTarget)
        self.init(policy: policy, target: target, decision: decision,
                  readBundleValue: readBundleValue, supportsHTTPScheme: supportsHTTPScheme)
    }

    private init(policy: NativeComputerUsePolicy, target: NativeApplicationTarget,
                 decision: NativeComputerUsePolicy.Decision,
                 readBundleValue: (String) -> Any?, supportsHTTPScheme: () -> Bool) {
        self.decision = decision
        appPath = target.identifier
        bundleIdentifier = target.bundleIdentifier
        displayName = readBundleValue("CFBundleDisplayName") as? String
            ?? readBundleValue("CFBundleName") as? String
            ?? target.bundleURL.deletingPathExtension().lastPathComponent
        approval = NativePolicyApprovalMetadata(policy: policy,
            bundleIdentifier: target.bundleIdentifier, supportsHTTPScheme: supportsHTTPScheme)
    }

    init(policy: NativeComputerUsePolicy, target: NativeApplicationTarget) {
        // The original evaluates access before constructing the Bundle.
        let decision = policy.decisionWithDefaultTargetClassification(bundleIdentifier: target.bundleIdentifier)
        let bundle = Bundle(url: target.bundleURL)
        self.init(policy: policy, target: target, decision: decision,
                  readBundleValue: { bundle?.object(forInfoDictionaryKey: $0) },
                  supportsHTTPScheme: { bundle?.supportsHTTPScheme ?? false })
    }

    /// Standalone host projection of the observed Sky client result contract.
    var ipcObject: [String: Any] {
        var target: [String: Any] = ["appPath": appPath, "bundleIdentifier": bundleIdentifier,
            "displayName": displayName, "risk": approval.risk.rawValue]
        if let warning = approval.warningSubtitle { target["warningSubtitle"] = warning }
        return ["decision": decision.rawValue, "allowPersistentApproval": approval.allowPersistentApproval,
                "target": target]
    }
}
