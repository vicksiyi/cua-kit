// Native callback 0x10075ab6c calls AccessibilityNode.accessibilityDescription
// with the same inout transformation context (0x10075abd8 -> 0x100625d58).
func macTransformationRenderNode(_ element: TransformedUIElement,
    _ context: inout UIElementTransformationContext) -> String {
    element.accessibilityDescription(context: &context)
}
