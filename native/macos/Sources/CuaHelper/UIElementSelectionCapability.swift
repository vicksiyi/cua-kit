// UIElementProtocol.isSelectable, 0x1007abdfc..<0x1007abf94.
// Menu items are deliberately excluded even if AXSelected is writable.
func uiElementIsSelectable(
    role: UIElementRole,
    selectedIsSupportedAndSettable: () -> Bool
) -> Bool {
    guard role != .menuItem && role != .menuBarItem else { return false }
    return selectedIsSupportedAndSettable()
}
