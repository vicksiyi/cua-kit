// UIElementProtocol.actions, 0x1007916b0..<0x100791a24. The supplemental
// getter (0x10079446c) uses protocol properties, not a raw AX substitution.
func uiElementActions(
    readActions: () throws -> [UIElementAction],
    isDisclosable: () -> Bool,
    isDisclosing: () -> Bool,
    reportError: (Error) -> Void
) -> [UIElementAction] {
    let actions: [UIElementAction]
    do { actions = try readActions() }
    catch { reportError(error); return [] }
    guard isDisclosable() else { return actions }
    // Append, without deduplicating against the native actions array.
    return actions + [isDisclosing() ? .collapse : .expand]
}
