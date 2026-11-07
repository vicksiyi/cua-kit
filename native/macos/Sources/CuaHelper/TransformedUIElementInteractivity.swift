// Extracted predicates from TransformedUIElement; the full transformed owner
// and its production tree integration remain separate reconstruction work.
// Pinned SkyComputerUseService: b64e219f30c655407e485d5fab47d354ea6398842fc49a6bad917810df54c862.

// 0x100760f2c: field offsets 0x5c (focusable), 0x54 (selectable).
func transformedUIElementIsFocusableOrSelectable(isFocusable: Bool, isSelectable: Bool) -> Bool {
    isFocusable || isSelectable
}

// 0x100760f64: negate all-actions-membership in this two-action set.
// Nil and empty action lists therefore return false. Read mutable action
// constants each call, as the original does, rather than freezing raw strings.
func transformedUIElementHasInterestingActions(_ actions: [UIElementAction]?) -> Bool {
    let excluded: Set<UIElementAction> = [.scrollToVisible, .showMenu]
    return !(actions ?? []).allSatisfy { excluded.contains($0) }
}

// 0x1007611cc: this is a role/focus predicate, not an enabled or action check.
func transformedUIElementCanBeUserInteractive(
    role: UIElementRole, isFocusable: Bool, isSelectable: Bool
) -> Bool {
    if role == .staticText {
        return transformedUIElementIsFocusableOrSelectable(
            isFocusable: isFocusable, isSelectable: isSelectable)
    }
    if role == .textArea || role == .group { return isFocusable }
    return true
}
