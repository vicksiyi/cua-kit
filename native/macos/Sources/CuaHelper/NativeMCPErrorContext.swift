import MCP

/// Error-derived context from 0x100e5e7bc..<0x100e5e874 and its value encoder
/// at 0x100e5e874..<0x100e5ea68. This creates result metadata only; it does not
/// send telemetry or authorize an operation.
struct NativeMCPErrorContext: Equatable {
    let targetID: String?
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
        if let targetID, !targetID.isEmpty { span["target_id"] = .string(targetID) }
        return .object(["span": .object(span)])
    }
}


/// Native ErrorWithCodexSpanTelemetry descriptor 0x1012e6e88. The context is
/// nonoptional, while its target ID is optional (CodexSpanTelemetry metadata).
struct NativeErrorWithCodexSpanTelemetry: Error {
    let underlyingError: Error
    let codexSpanTelemetry: NativeMCPErrorContext
}

/// Front of the native result builder, 0x100e5ed44..<0x100e5ee24.
/// Unwrap exactly one layer. Explicit context takes precedence over wrapper
/// context, which takes precedence over inference from the underlying error.
enum NativeMCPErrorResolution {
    struct Resolved {
        let error: Error
        let context: NativeMCPErrorContext?
    }

    static func resolve(_ error: Error, context: NativeMCPErrorContext? = nil) -> Resolved {
        let underlying: Error
        let wrappedContext: NativeMCPErrorContext?
        if let wrapped = error as? NativeErrorWithCodexSpanTelemetry {
            underlying = wrapped.underlyingError
            wrappedContext = wrapped.codexSpanTelemetry
        } else {
            underlying = error
            wrappedContext = nil
        }
        return Resolved(error: underlying,
                        context: context ?? wrappedContext ?? NativeMCPErrorContext.infer(from: underlying))
    }
}
