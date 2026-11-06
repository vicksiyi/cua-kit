import Foundation

/// Risk and persistence portion of the original app-policy result. This does
/// not request approval, persist an approval, or authorize an operation.
struct NativePolicyApprovalMetadata: Equatable {
    enum Risk: String { case low, high }
    let risk: Risk
    let warningSubtitle: String?
    let allowPersistentApproval: Bool

    static let elevatedRiskBundleIdentifiers = [
        "com.apple.ScreenContinuity", "com.apple.keychainaccess", "com.apple.Passwords",
        "com.1password.1password", "com.1password.safari", "com.bitwarden.desktop",
        "com.dashlane.dashlanephonefinal", "com.lastpass.LastPass", "com.nordsec.nordpass",
        "me.proton.pass.electron", "me.proton.pass.catalyst",
    ]
    static let elevatedRiskWarning = "Allowing ChatGPT to use this app introduces new risks, including those related to prompt injection attacks, such as data theft or loss. Carefully monitor ChatGPT while it uses this app."

    /// Source 0x100191eec..<0x100192130. Probe the bundle only when neither
    /// identifier list matched. The caller represents an absent bundle as false.
    init(policy: NativeComputerUsePolicy, bundleIdentifier: String,
         supportsHTTPScheme: () -> Bool) {
        let high = NativeForbiddenTargets.terminals.contains(bundleIdentifier)
            || Self.elevatedRiskBundleIdentifiers.contains(bundleIdentifier)
            || supportsHTTPScheme()
        risk = high ? .high : .low
        warningSubtitle = high ? Self.elevatedRiskWarning : nil
        // Original copies this field unchanged; high risk is not an additional
        // persistence veto in this result-construction branch.
        allowPersistentApproval = policy.allowPersistentApproval
    }

    init(policy: NativeComputerUsePolicy, bundleIdentifier: String, bundle: Bundle?) {
        self.init(policy: policy, bundleIdentifier: bundleIdentifier,
                  supportsHTTPScheme: { bundle?.supportsHTTPScheme ?? false })
    }
}
