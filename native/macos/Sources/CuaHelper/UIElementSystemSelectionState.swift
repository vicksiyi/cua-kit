import ApplicationServices

extension UIElement {
    func systemIsSelected(reportError: (Error) -> Void) -> Bool {
        isSelected {
            catalystTraitsRawValue(read: { readSystemAXAttributeValue(axElement, UIElementAttribute("AXTraits")) },
                reportError: reportError)
        }
    }
}
