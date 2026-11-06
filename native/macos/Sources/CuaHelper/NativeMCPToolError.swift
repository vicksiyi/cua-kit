/// Native MCPToolError descriptor 0x1012e6ea4, field records 0x1013426bc.
/// Preserves case names and associated values. Localized descriptions and wire
/// error conversion remain separate, unverified parts of the native MCP server.
enum NativeMCPToolError: Error, Equatable {
    case missingArgument(String)
    case invalidArgument(String)
    case unknownTool(String)
    case appBlockedByPolicy(bundleIdentifier: String)
    case appNotAllowed(bundleIdentifier: String)
    case appApprovalDenied(bundleIdentifier: String)
    case appApprovalCanceled(bundleIdentifier: String)
    case appApprovalPersistenceUnavailable(bundleIdentifier: String)
}
