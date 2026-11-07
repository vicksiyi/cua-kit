import Foundation
import ApplicationServices

// Stored fields from nominal descriptor 0x1012ccde4 / field table 0x101323964.
// Common constructor 0x10075e160..<0x10075ff54. Downstream tree transforms
// and protocol conformance are separate from this captured node state.
struct TransformedUIElement {
    var element: UIElement
    var role: UIElementRole
    var subrole: String?
    var roleDescription: String?
    var title: String?
    var description: String?
    var value: String?
    var truncationRange: NSRange?
    var valueDescription: String?
    var valueTypeName: String?
    var placeholderValue: String?
    var help: String?
    var identifier: String?
    var url: URL?
    var domClassList: [String]?
    var actionDescriptions: [UIElementActionDescription]
    var isSelected: Bool
    var isSelectable: Bool
    var isFocused: Bool
    var isFocusable: Bool
    var isEnabled: Bool
    var isDisclosing: Bool
    var isDisclosable: Bool
    var isValueSettable: Bool
    var attributedString: NSAttributedString?
    var transformedString: TransformedUIString?

    init(element: UIElement, context: UIElementTransformationContext,
        traversalParentRole: UIElementRole?, reportError: (Error) -> Void,
        reportUnknownDateComponents: (UInt) -> Void
    ) {
        self.element = element
        role = element.role
        subrole = element.cachedStringValue(for: UIElementAttribute("AXSubrole"))
        roleDescription = element.cachedStringValue(for: UIElementAttribute("AXRoleDescription"))
        title = element.cachedStringValue(for: UIElementAttribute("AXTitle"))
        description = element.cachedStringValue(for: UIElementAttribute("AXDescription"))
        let valueState = element.transformedValueState(contextType: context.type,
            isChromium: context.isChromium, traversalParentRole: traversalParentRole,
            reportError: reportError, reportUnknownDateComponents: reportUnknownDateComponents)
        value = valueState.value
        truncationRange = valueState.truncationRange
        valueTypeName = valueState.valueTypeName
        isValueSettable = valueState.isValueSettable
        valueDescription = element.cachedStringValue(for: UIElementAttribute("AXValueDescription"))
        placeholderValue = element.cachedStringValue(for: UIElementAttribute("AXPlaceholderValue"))
        help = element.cachedStringValue(for: UIElementAttribute("AXHelp"))
        identifier = element.cachedStringValue(for: UIElementAttribute("AXIdentifier"))
        url = element.transformedURL(capturedRole: role, reportError: reportError)
        domClassList = element.transformedDOMClassList
        isSelected = element.isSelected(reportError: reportError)
        isFocused = element.isFocused
        isEnabled = element.isEnabled
        isDisclosing = element.isDisclosing
        let capabilities = transformedUIElementInteractionCapabilities(
            contextType: context.type, isCatalyst: context.isCatalyst, role: role,
            readTraits: { element.catalystTraitsRawValue(
                read: { element.axElement.value(for: UIElementAttribute("AXTraits")) },
                reportError: reportError) },
            hasSupportedSelectionAttributes: { !element.supportedSelectionAttributes.isEmpty },
            readSelectable: { element.isSelectable }, readFocusable: { element.isFocusable })
        isSelectable = capabilities.isSelectable
        isFocusable = capabilities.isFocusable
        isDisclosable = transformedUIElementIsDisclosable(contextType: context.type,
            isDisclosing: isDisclosing, cache: element.cache,
            freshSupportedAttributes: { Set(element.axElement.supportedAttributes) },
            isAttributeSettable: { try element.axElement.isAttributeSettable($0) })
        actionDescriptions = element.transformedActionDescriptions(contextType: context.type,
            capturedIsDisclosable: isDisclosable, capturedIsDisclosing: isDisclosing,
            reportError: reportError)
        // Source initializes these to nil; rich text is populated later.
        attributedString = nil
        transformedString = nil
    }
}
