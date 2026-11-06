import Foundation

@main struct NativePolicyApprovalMetadataTests {
    static func main() throws {
        for persistent in [false, true] {
            let policy = try NativeComputerUsePolicy.parse(
                requirementsResponse: ["requirements": ["computerUse": ["allowPersistentApproval": persistent]]],
                configResponse: ["config": [:]])
            for identifier in NativeForbiddenTargets.terminals + NativePolicyApprovalMetadata.elevatedRiskBundleIdentifiers {
                let result = NativePolicyApprovalMetadata(policy: policy, bundleIdentifier: identifier,
                    supportsHTTPScheme: { preconditionFailure("List match must not read bundle metadata") })
                precondition(result.risk == .high)
                precondition(result.warningSubtitle == NativePolicyApprovalMetadata.elevatedRiskWarning)
                precondition(result.allowPersistentApproval == persistent)
            }
            for http in [false, true] {
                var reads = 0
                let result = NativePolicyApprovalMetadata(policy: policy, bundleIdentifier: "example.fixture") {
                    reads += 1; return http
                }
                precondition(reads == 1)
                precondition(result.risk == (http ? .high : .low))
                precondition((result.warningSubtitle != nil) == http)
                precondition(result.allowPersistentApproval == persistent)
            }
            let absent = NativePolicyApprovalMetadata(policy: policy, bundleIdentifier: "example.fixture", bundle: nil)
            precondition(absent.risk == .low && absent.warningSubtitle == nil)
            // Reuse the already restored bundle predicate: https alone does not
            // satisfy its exact "http" test; malformed scheme arrays do not cast.
            for (schemes, high): (Any, Bool) in [(["https"], false), (["HTTP"], false),
                                                (["http"], true), (["http", 1], false)] {
                let result = NativePolicyApprovalMetadata(policy: policy, bundleIdentifier: "example.fixture") {
                    bundleSupportsHTTPScheme { key in
                        precondition(key == "CFBundleURLTypes")
                        return [["CFBundleURLSchemes": schemes]]
                    }
                }
                precondition((result.risk == .high) == high)
            }
            for identifier in NativePolicyApprovalMetadata.elevatedRiskBundleIdentifiers {
                let result = NativePolicyApprovalMetadata(policy: policy, bundleIdentifier: identifier + ".child",
                    supportsHTTPScheme: { false })
                precondition(result.risk == .low)
            }
        }
        print("native approval metadata risk lists, lazy HTTP probe and persistence passthrough passed")
    }
}
