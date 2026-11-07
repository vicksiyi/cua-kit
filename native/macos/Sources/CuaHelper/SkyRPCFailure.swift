import ApplicationServices

/// Owned server projection onto the observed Sky wire contract.
/// Host-specific failures must not impersonate numeric AX errors.
struct SkyRPCFailure: Error, Equatable {
    let code: Int
    let message: String

    static func accessibility(_ error: AXError) -> Self {
        Self(code: -10008, message: String(error.rawValue))
    }

    static func hostFailure(code: String, message: String) -> Self {
        let wireCode: Int
        switch code {
        case "PERMISSION_DENIED": wireCode = -10009
        case "TARGET_NOT_FOUND": wireCode = -10007
        case "AMBIGUOUS_TARGET": wireCode = -10018
        case "INVALID_ARGUMENT": wireCode = -32602
        // Stale snapshots and event allocation failures are owned-host errors,
        // not AXError values. Preserve their message as an unknown server error.
        default: wireCode = -10005
        }
        return Self(code: wireCode, message: message)
    }
}
