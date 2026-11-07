import MCP

/// The pinned vendor MCP result has an extra toolResult field absent from the
/// pinned upstream SDK. Compose with its codec instead of forking MCP content,
/// Value and Metadata. Descriptor: 0x1012e27a4; coding key getter: 0x100d26318.
struct NativeCallToolResult: Codable, Equatable {
    struct ToolResult: Codable, Equatable {
        let content: [Tool.Content]?
        let isError: Bool?
    }

    var result: CallTool.Result
    var toolResult: ToolResult?

    init(result: CallTool.Result, toolResult: ToolResult? = nil) {
        self.result = result
        self.toolResult = toolResult
    }

    private enum CodingKeys: String, CodingKey { case toolResult }

    init(from decoder: Decoder) throws {
        result = try CallTool.Result(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        toolResult = try container.decodeIfPresent(ToolResult.self, forKey: .toolResult)
    }

    func encode(to encoder: Encoder) throws {
        try result.encode(to: encoder)
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(toolResult, forKey: .toolResult)
    }
}

extension NativeMCPResultContext {
    static func applying(_ context: NativeMCPErrorContext?, to result: NativeCallToolResult) -> NativeCallToolResult {
        var output = result
        output.result = applying(context, to: result.result)
        return output
    }
}


extension NativeCallToolResult {
    /// The native generic failure branch at 0x100e5f05c..<0x100e5f198.
    /// The caller must first select this branch; interruption IPC errors use a
    /// different result path. Do not use this as a universal native error mapper.
    static func genericFailure(_ error: Error, context: NativeMCPErrorContext? = nil) -> Self {
        let base = Self(result: CallTool.Result(
            content: [.text(String(describing: error))], isError: true))
        return NativeMCPResultContext.applying(context, to: base)
    }
}


extension NativeCallToolResult {
    /// Selected interruption branch. The pinned path starts with no screenshot
    /// and leaves isError absent. nil means the caller must select another path.
    static func interruption(_ error: NativeIPCClientError, context: NativeMCPErrorContext? = nil) -> Self? {
        guard let description = error.interruptionDescription else { return nil }
        return NativeMCPResultContext.applying(context, to:
            Self(result: CallTool.Result(content: [.text(description)])))
    }
}


extension NativeCallToolResult {
    /// Native builder composition: unwrap/context selection, IPC interruption
    /// handling, generic description, and result metadata merge.
    static func failure(_ error: Error, context: NativeMCPErrorContext? = nil) -> Self {
        let resolved = NativeMCPErrorResolution.resolve(error, context: context)
        if let ipc = resolved.error as? NativeIPCClientError,
           let result = interruption(ipc, context: resolved.context) { return result }
        return genericFailure(resolved.error, context: resolved.context)
    }
}
