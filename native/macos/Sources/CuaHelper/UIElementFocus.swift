// UIElementProtocol.focus(in:app:focusEnforcer:), 0x1007b5fc8..<0x1007b6228.
// The fallback is the original async click(in:app:...), not a raw AXPress.
// Window/application/cursor dependencies stay with that click implementation.
func focusUIElementUsingAttributeOrClick(
    isFocusable: () -> Bool,
    setFocused: () throws -> Void,
    readUncachedFocused: () -> Bool?,
    clickFallback: () async throws -> Void
) async throws {
    if isFocusable() {
        try setFocused()
        if readUncachedFocused() == true { return }
    }
    try await clickFallback()
}
