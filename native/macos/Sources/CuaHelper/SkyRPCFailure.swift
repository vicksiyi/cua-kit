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
        case "INVALID_ARGUMENT": wireCode = -32602
        // Host target errors also describe windows, text and display devices.
        // Only application-aware call sites may emit app-specific wire codes.
        // Preserve these and other owned-host failures as generic server errors.
        default: wireCode = -10005
        }
        return Self(code: wireCode, message: message)
    }
}
