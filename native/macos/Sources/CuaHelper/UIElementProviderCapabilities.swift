import ApplicationServices

extension UIElement {
    func isAttributeSupportedAndSettable(_ attribute: UIElementAttribute) -> Bool {
        uiElementIsAttributeSupportedAndSettable(attribute, readCache: { cache },
            freshSupportedAttributes: { Set(axElement.supportedAttributes) },
            isAttributeSettable: { try axElement.isAttributeSettable($0) })
    }

    // 0x1007ac3b8 / 0x1007ac550 both tail-call the support-and-settable helper.
    var isDisclosable: Bool { isAttributeSupportedAndSettable(UIElementAttribute(kAXDisclosingAttribute)) }
    var isValueSettable: Bool { isAttributeSupportedAndSettable(UIElementAttribute(kAXValueAttribute)) }

    var isFocusable: Bool {
        isFocusable(freshSupportedAttributes: { Set(axElement.supportedAttributes) },
            isAttributeSettable: { try axElement.isAttributeSettable($0) })
    }

    var isSelectable: Bool {
        uiElementIsSelectable(role: role) {
            isAttributeSupportedAndSettable(UIElementAttribute(kAXSelectedAttribute))
        }
    }

    func isSelected(reportError: (Error) -> Void) -> Bool {
        isSelected {
            catalystTraitsRawValue(read: { axElement.value(for: UIElementAttribute("AXTraits")) },
                reportError: reportError)
        }
    }
}
