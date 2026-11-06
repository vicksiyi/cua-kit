import Foundation

/// App-policy request order at 0x100191ad4..<0x100192130:
/// resolve target, await cached provider, then construct the policy result.
@MainActor
struct NativeAppPolicyEvaluation {
    let resolve: (String) throws -> NativeApplicationTarget
    let loadPolicy: () async throws -> NativeComputerUsePolicy

    func evaluate(_ reference: String) async throws -> NativeAppPolicyResult {
        let target = try resolve(reference)
        let policy = try await loadPolicy()
        return NativeAppPolicyResult(policy: policy, target: target)
    }
}
