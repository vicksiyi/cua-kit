import ApplicationServices

extension UIElementTree where Element == TransformedUIElement {
    // Native0x100766558 passes no captured app to its dispatch thunk0x100767f74.
    // Preserve the original for: argument without using it as a substitute
    // for each node's owning application. Host dependencies remain explicit.
    func transformed(for application: ApplicationUIElement,
        using transformations: [MacUIElementTreeTransformation],
        in context: inout UIElementTransformationContext,
        rebuild: (inout Self, Item, inout UIElementTransformationContext) -> Void,
        providerTitle: (AXUIElement) -> String? = macTransformationProviderTitle,
        owningBundleIdentifier: ((TransformedUIElement) -> String?)? = nil,
        renderNode: (TransformedUIElement, inout UIElementTransformationContext) throws -> String = macTransformationRenderNode,
        reportUnknownAttributedStyle: (String) -> Void,
        reportAttributeError: (Error) -> Void,
        reportUnexpectedNextLine: () -> Void
    ) -> Self {
        transformed(using: transformations, in: &context) { rule, item, context in
            rule.transform(item: item, context: &context, rebuild: rebuild,
                providerTitle: providerTitle, owningBundleIdentifier: owningBundleIdentifier,
                renderNode: renderNode, reportUnknownAttributedStyle: reportUnknownAttributedStyle,
                reportAttributeError: reportAttributeError, reportUnexpectedNextLine: reportUnexpectedNextLine)
        }
    }
}

extension UIElementTree where Element == TransformedUIElement {
    // Concrete host binding for the common rules' provider rebuild callback.
    func transformed(for application: ApplicationUIElement,
        using transformations: [MacUIElementTreeTransformation],
        in context: inout UIElementTransformationContext,
        reportDepthLimit: () -> Void, reportLimit: (VisibleChildrenLimitReason) -> Void,
        reportUnknownDateComponents: (UInt) -> Void,
        reportUnknownAttributedStyle: (String) -> Void, reportAttributeError: (Error) -> Void,
        reportUnexpectedNextLine: () -> Void
    ) -> Self {
        transformed(for: application, using: transformations, in: &context,
            rebuild: { tree, item, context in
                macTransformationRebuild(&tree, item, &context, reportDepthLimit: reportDepthLimit,
                    reportLimit: reportLimit, reportError: reportAttributeError,
                    reportUnknownDateComponents: reportUnknownDateComponents)
            }, reportUnknownAttributedStyle: reportUnknownAttributedStyle,
            reportAttributeError: reportAttributeError, reportUnexpectedNextLine: reportUnexpectedNextLine)
    }
}
