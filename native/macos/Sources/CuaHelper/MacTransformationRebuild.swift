// Native callback0x10075a858 extracts the source UIElement from the captured
// item and enters provider tree construction with empty path/nil parent/fresh
// visited. It does not copy the transformed title/value or captured subtree.
func macTransformationRebuild(_ tree: inout UIElementTree<TransformedUIElement>,
    _ item: UIElementTree<TransformedUIElement>.Item,
    _ context: inout UIElementTransformationContext,
    reportDepthLimit: () -> Void, reportLimit: (VisibleChildrenLimitReason) -> Void,
    reportError: (Error) -> Void, reportUnknownDateComponents: (UInt) -> Void
) {
    tree.add(item.element.element, context: &context, reportDepthLimit: reportDepthLimit,
        reportLimit: reportLimit, reportError: reportError,
        reportUnknownDateComponents: reportUnknownDateComponents)
}
