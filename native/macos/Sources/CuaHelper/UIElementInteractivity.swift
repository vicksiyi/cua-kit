// AccessibilityNode defaults at 0x100624f30 and 0x100624f84. Keep these
// callbacks lazy: capability reads may query native attribute writability.
func uiElementIsFocusableOrSelectable(
    isFocusable: () -> Bool, isSelectable: () -> Bool
) -> Bool {
    isFocusable() || isSelectable()
}

func uiElementCanBeUserInteractive(
    isFocusable: () -> Bool, isSelectable: () -> Bool, isValueSettable: () -> Bool
) -> Bool {
    isFocusable() || isSelectable() || isValueSettable()
}
