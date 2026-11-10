// Candidate search0x1007674b0 tests supported selectedRows/Cells/Children in
// that order and stops at the first positive count. Count failure/absence/zero
// continue; decoding the chosen collection belongs to a later, separate stage.
func uiElementFocusSelectionAttribute(supported: Set<UIElementAttribute>,
    count: (UIElementAttribute) throws -> Int?) -> UIElementAttribute? {
    for attribute in uiElementSupportedSelectionAttributes(supported) {
        if uiElementHasCount({ try count(attribute) }) { return attribute }
    }
    return nil
}
