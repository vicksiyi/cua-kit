import Foundation
import ApplicationServices

extension MacUIElementTreeTransformation {
    // Entry 0x1007595fc: Mac-specific branches surround common dispatch.
    // Traversal rebuild remains a required host composition. Provider title,
    // owning application and node rendering use recovered native defaults.
    // Attributed rendering now uses the recovered native implementation.
    func transform(
        item: UIElementTree<TransformedUIElement>.Item,
        context: inout UIElementTransformationContext,
        rebuild: (inout UIElementTree<TransformedUIElement>, UIElementTree<TransformedUIElement>.Item, inout UIElementTransformationContext) -> Void,
        providerTitle: (AXUIElement) -> String? = macTransformationProviderTitle,
        owningBundleIdentifier: ((TransformedUIElement) -> String?)? = nil,
        renderNode: (TransformedUIElement, inout UIElementTransformationContext) throws -> String = macTransformationRenderNode,
        reportUnknownAttributedStyle: (String) -> Void,
        reportAttributeError: (Error) -> Void,
        reportUnexpectedNextLine: () -> Void
    ) -> UIElementTreeTransformation.Result<TransformedUIElement> {
        switch self {
        case .filterActions:
            return Self.filterActions(item: item, context: context, readElement: { attribute in
                item.element.element.elementValue(for: attribute,
                    initialize: { UIElement(element: $0) },
                    read: { item.element.axElement.value(for: attribute) },
                    reportError: reportAttributeError)
            })
        case .removeElementsUnderCalendarEvents:
            return Self.removeElementsUnderCalendarEvents(item: item,
                owningBundleIdentifier: {
                    if let owningBundleIdentifier { return owningBundleIdentifier(item.element) }
                    return item.element.owningApplicationBundleIdentifier(reportError: reportAttributeError)
                })
        case .retrieveAttributedTextFromTextAreas:
            return Self.retrieveAttributedTextFromTextAreas(item: item, context: &context,
                reportAttributeError: reportAttributeError, render: { text, context in
                    renderNativeAttributedText(text, context: &context,
                        reportUnknownStyle: reportUnknownAttributedStyle)
                })
        case .retrieveAttributedTextFromWebAreas:
            return Self.retrieveAttributedTextFromWebAreas(item: item, context: &context,
                reportAttributeError: reportAttributeError,
                reportUnexpectedNextLine: reportUnexpectedNextLine, render: { text, context in
                    renderNativeAttributedText(text, context: &context,
                        reportUnknownStyle: reportUnknownAttributedStyle)
                })
        case .shared(.pruneNonDescriptiveSubtrees):
            return Self.pruneNonDescriptiveSubtrees(item: item, context: context)
        case .shared(let rule):
            // Optional callback parameters in the common generic API escape
            // syntactically; the synchronous call here must not retain them.
            return withoutActuallyEscaping(rebuild) { rebuild in
                withoutActuallyEscaping(providerTitle) { providerTitle in
                    rule.transform(item: item, context: &context, rebuild: rebuild,
                        providerTitle: providerTitle, render: renderNode)
                }
            }
        }
    }
}
