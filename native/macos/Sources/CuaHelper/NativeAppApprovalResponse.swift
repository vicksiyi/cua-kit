import MCP

/// Native MCP caller branches at 0x100e52ee8..<0x100e53594. Protocol decoding
/// belongs to the upstream SDK; this maps only CUA's approval response semantics.
enum NativeAppApprovalResponse {
    enum Outcome: Equatable {
        case accepted(persist: Bool)
        case declined
        case cancelled
    }

    static func interpret(_ response: CreateElicitation.Result) -> Outcome {
        switch response.action {
        case .accept:
            let persist: Bool
            if case .string("always") = response._meta?["persist"] { persist = true }
            else { persist = false }
            return .accepted(persist: persist)
        case .decline: return .declined
        case .cancel: return .cancelled
        }
    }

    /// Native caller: decline/cancel throw before touching the store; acceptance
    /// forwards persistence unchanged and propagates storage failures.
    static func record(_ response: CreateElicitation.Result, bundleIdentifier: String,
                       store: NativeAppApprovalStore) async throws {
        switch interpret(response) {
        case let .accepted(persist):
            try await store.recordApproval(bundleIdentifier: bundleIdentifier, persist: persist)
        case .declined:
            throw NativeMCPToolError.appApprovalDenied(bundleIdentifier: bundleIdentifier)
        case .cancelled:
            throw NativeMCPToolError.appApprovalCanceled(bundleIdentifier: bundleIdentifier)
        }
    }

}
