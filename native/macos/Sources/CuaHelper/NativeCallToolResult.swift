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
