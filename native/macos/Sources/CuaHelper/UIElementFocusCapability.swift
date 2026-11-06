// UIElementProtocol.isFocusable, 0x1007abfbc..<0x1007ac238.
func uiElementIsFocusable(
    focusedIsSupported: () -> Bool,
    role: () -> UIElementRole,
    focusedIsSettable: () throws -> Bool,
    isEnabled: () -> Bool
) -> Bool {
    guard focusedIsSupported() else { return false }
    let currentRole = role()
    let usesEnabledFallback = currentRole == .textArea || currentRole == .textField || currentRole == .dateTimeArea
    do { return try focusedIsSettable() }
    catch { return usesEnabledFallback ? isEnabled() : false }
}
