// Protocol descriptor 0x1012ccda8: no inherited requirements, one method.
protocol LMReadableElement {
    func lmReadableDescription(for context: inout UIElementTransformationContext) throws -> String
}

// Named implementation 0x10075c574 and witness 0x1007627f0 both invoke
// the generic AccessibilityNode composition at 0x100625d58.
extension TransformedUIElement: LMReadableElement {
    func lmReadableDescription(for context: inout UIElementTransformationContext) throws -> String {
        accessibilityDescription(context: &context)
    }
}

// 0x10076ad18 -> generic render with the protocol witness callback.
// Both native constraints are retained; transformed nodes now provide the
// audited UIElementProtocol constructors and action witnesses.
extension UIElementTree where Element: LMReadableElement & UIElementProtocol {
    func render(with context: inout UIElementTransformationContext) throws -> UIElementRenderTree<Element.ID> {
        try render(with: &context) { element, context in
            try element.lmReadableDescription(for: &context)
        }
    }
}
