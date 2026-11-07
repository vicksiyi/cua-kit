// Extracted common-constructor branch 0x10075f860..0x10075fa78.
// Names are local until the complete TransformedUIElement owner is restored.
// Role tables: 0x10076190c (selection), 0x100761a78 (focus).
private let transformedSelectableRoles: Set<UIElementRole> = [
    UIElementRole("AXCell"), .radioButton, .row, UIElementRole("AXTabGroup"),
]
private let transformedFocusableRoles: Set<UIElementRole> = [
    UIElementRole("AXButton"),
    UIElementRole("AXCell"),
    UIElementRole("AXCheckBox"),
    UIElementRole("AXColorWell"),
    UIElementRole("AXComboBox"),
    UIElementRole("AXDateField"),
    UIElementRole("AXDateTimeArea"),
    UIElementRole("AXDisclosureTriangle"),
    UIElementRole("AXDockItem"),
    UIElementRole("AXIncrementor"),
    UIElementRole("AXLink"),
    UIElementRole("AXMenuBarItem"),
    UIElementRole("AXMenuButton"),
    UIElementRole("AXMenuItem"),
    UIElementRole("AXPopUpButton"),
    UIElementRole("AXRadioButton"),
    UIElementRole("AXRow"),
    UIElementRole("AXSlider"),
    UIElementRole("AXTabGroup"),
    UIElementRole("AXTextArea"),
    UIElementRole("AXTextField"),
    UIElementRole("AXTimeField"),
]

func transformedUIElementInteractionCapabilities(
    contextType: UIElementContextType,
    isCatalyst: Bool,
    role: UIElementRole,
    readTraits: () -> UInt64?,
    hasSupportedSelectionAttributes: () -> Bool,
    readSelectable: () -> Bool,
    readFocusable: () -> Bool
) -> (isSelectable: Bool, isFocusable: Bool) {
    guard contextType.infersInteractionCapabilitiesFromCachedState else {
        let selectable = readSelectable()
        let focusable = readFocusable()
        return (selectable, focusable)
    }
    let traits = isCatalyst ? (readTraits() ?? 0) : 0
    let traitFocusable = traits & 0x0030810011141403 != 0
    // The original skips the supported-selection-attribute scan on a trait hit.
    let selectionCandidate = traits & 0x10100008 != 0 || hasSupportedSelectionAttributes()
    let selectable = transformedSelectableRoles.contains(role)
        || (role == .group && selectionCandidate)
    let focusable = traitFocusable || transformedFocusableRoles.contains(role)
        || (role == .group && selectable)
    return (selectable, focusable)
}
