import ApplicationServices

// Original target initializer acquires the current transaction at construction,
// after raw decoding; no captured or synthesized transaction replaces it.
func decodeAXUIElement(_ raw: AnyObject, throwingOnFailure: Bool) throws -> UIElement? {
    try decodeAXUIElement(raw, throwingOnFailure: throwingOnFailure,
        initialize: { UIElement(element: $0) })
}

extension UIElementProtocol {
    func parentValue(reportError: (Error) -> Void) -> UIElement? {
        let attribute = UIElementAttribute(kAXParentAttribute)
        return elementValue(for: attribute, initialize: { UIElement(element: $0) },
            read: { axElement.value(for: attribute) }, reportError: reportError)
    }

    func parentChain(maxDepth: Int = 300, includingSelf: Bool,
        reportError: @escaping (Error) -> Void
    ) -> UnfoldSequence<any UIElementProtocol, (node: (any UIElementProtocol)?, depth: Int)> {
        uiElementParentChain(of: self as any UIElementProtocol, maxDepth: maxDepth, includingSelf: includingSelf) {
            $0.parentValue(reportError: reportError)
        }
    }
}
