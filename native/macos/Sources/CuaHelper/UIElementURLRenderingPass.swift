// shortenURLsIfNeeded 0x1007587b4..<0x100758848. Key path preserves a full
// caller-owned context without inventing a partial original context/protocol.
// The body runs ONCE. A throw skips compaction, accounting and the final reset.
func withUIElementURLRenderingPass<Context, Result>(
    context: inout Context, shortener: WritableKeyPath<Context, UIElementURLShortener>,
    totalLength: inout Int, body: (inout Context) throws -> Result
) rethrows -> Result {
    context[keyPath: shortener].reset()
    let result = try body(&context)
    totalLength += context[keyPath: shortener].compactConfigurationIfNeeded()
    context[keyPath: shortener].reset()
    return result
}
