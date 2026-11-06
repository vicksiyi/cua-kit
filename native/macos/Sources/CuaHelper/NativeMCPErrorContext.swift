import MCP

/// Error-derived context from 0x100e5e7bc..<0x100e5e874 and its value encoder
/// at 0x100e5e874..<0x100e5ea68. This creates result metadata only; it does not
/// send telemetry or authorize an operation. Other native error wrappers and
/// explicit context overrides belong to the still-unrestored outer boundary.
struct NativeMCPErrorContext: Equatable {
    let targetID: String
    let didTriggerServerUserFlow: Bool

    static func infer(from error: Error) -> Self? {
        guard let error = error as? NativeMCPToolError else { return nil }
        switch error {
        case .missingArgument, .invalidArgument, .unknownTool: return nil
        case let .appBlockedByPolicy(id), let .appNotAllowed(id):
            return Self(targetID: id, didTriggerServerUserFlow: false)
        case let .appApprovalDenied(id), let .appApprovalCanceled(id),
             let .appApprovalPersistenceUnavailable(id):
            return Self(targetID: id, didTriggerServerUserFlow: true)
        }
    }

    /// Value placed under the native result metadata key "codex/telemetry".
    var value: Value {
        var span: [String: Value] = [
            "did_trigger_server_user_flow": .bool(didTriggerServerUserFlow)
        ]
        if !targetID.isEmpty { span["target_id"] = .string(targetID) }
        return .object(["span": .object(span)])
    }
}
