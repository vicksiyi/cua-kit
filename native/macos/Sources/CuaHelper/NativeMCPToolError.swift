/// Native MCPToolError descriptor 0x1012e6ea4, field records 0x1013426bc.
/// Description witness 0x100e5ddf4 forwards to 0x100e5db0c. This is
/// CustomStringConvertible, not a recovered LocalizedError conformance.
enum NativeMCPToolError: Error, Equatable, CustomStringConvertible {
    case missingArgument(String)
    case invalidArgument(String)
    case unknownTool(String)
    case appBlockedByPolicy(bundleIdentifier: String)
    case appNotAllowed(bundleIdentifier: String)
    case appApprovalDenied(bundleIdentifier: String)
    case appApprovalCanceled(bundleIdentifier: String)
    case appApprovalPersistenceUnavailable(bundleIdentifier: String)

    var description: String {
        switch self {
        case let .missingArgument(name): return "Missing required argument: \(name)"
        case let .invalidArgument(message): return message
        case let .unknownTool(name): return "Unknown tool: \(name)"
        case let .appBlockedByPolicy(id):
            return "Computer Use is blocked from using the app '\(id)' by your organization's policy."
        case let .appNotAllowed(id):
            return "Computer Use is not allowed to use the app '\(id)' for safety reasons."
        case let .appApprovalDenied(id):
            return "Computer Use approval denied via MCP elicitation for app '\(id)'."
        case let .appApprovalCanceled(id):
            return "Computer Use permission request canceled for app '\(id)'."
        case let .appApprovalPersistenceUnavailable(id):
            return "Computer Use could not persist the approval permanently for app '\(id)'."
        }
    }
}
