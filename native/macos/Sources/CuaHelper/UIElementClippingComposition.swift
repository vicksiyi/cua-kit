import ApplicationServices

extension UIElementProtocol {
    // 0x10079fe78: AXFrame only. This deliberately does not call frameValue,
    // whose position/size fallback is not part of this clipping reader.
    func clippingFrameAttribute(
        uncached: Bool,
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> CGRect? {
        if !uncached, let partial = cache.attributes[.frame],
            let rect = try? decodeAXRect(partial.value.value, throwingOnFailure: false) {
            return rect
        }
        return uiElementUncachedValue(operation: {
            try uiElementUncachedValueThrowing(ignoringTypeMismatch: false,
                isKnownUnsupported: { attributeIsKnownUnsupported(.frame) }, read: read,
                decode: { try? decodeAXRect($0.value.value, throwingOnFailure: false) },
                decodeThrowing: { try decodeAXRect($0.value.value, throwingOnFailure: true) })
        }, reportError: reportError)
    }

    // 0x1007a026c chooses cached parent getter or strict uncached AXParent.
    func clippingParent(
        uncached: Bool, transaction: UIElementTransactionCache?,
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> UIElement? {
        clippingParent(uncached: uncached,
            initialize: { UIElement(systemElement: $0, transaction: transaction) },
            read: read, reportError: reportError)
    }

    func clippingParent(uncached: Bool, initialize: (AXUIElement) -> UIElement,
        read: () -> (error: AXError, value: AXPartialValue?), reportError: (Error) -> Void
    ) -> UIElement? {
        if !uncached {
            return elementValue(for: UIElementAttribute(kAXParentAttribute), initialize: initialize,
                read: read, reportError: reportError)
        }
        return uiElementUncachedValue(operation: {
            try uiElementUncachedValueThrowing(ignoringTypeMismatch: false,
                isKnownUnsupported: { attributeIsKnownUnsupported(UIElementAttribute(kAXParentAttribute)) }, read: read,
                decode: { try? decodeAXUIElement($0.value.value, throwingOnFailure: false, initialize: initialize) },
                decodeThrowing: { try decodeAXUIElement($0.value.value, throwingOnFailure: true, initialize: initialize) })
        }, reportError: reportError)
    }

}

extension UIElementProtocol {
    // 0x100794538: actions once -> Set -> intersect four page-scroll actions.
    func hasScrollAction(in environment: UIElementActionEnvironment, reportError: (Error) -> Void) -> Bool {
        let available = Set(actions(in: environment, reportError: reportError))
        return !available.intersection([.scrollLeftByPage, .scrollRightByPage, .scrollUpByPage, .scrollDownByPage]).isEmpty
    }

    func clippingFrame(
        uncached: Bool, transaction: UIElementTransactionCache?,
        environment: UIElementActionEnvironment, reportError: (Error) -> Void
    ) -> CGRect? {
        let root: any UIElementProtocol = self
        return uiElementClippingFrame(of: root, uncached: uncached, role: { $0.role },
            frameAttribute: { element, fresh in
                element.clippingFrameAttribute(uncached: fresh,
                    read: { environment.read(element.axElement, .frame) }, reportError: reportError)
            }, hasScrollAction: { $0.hasScrollAction(in: environment, reportError: reportError) },
            parent: { element, fresh in
                element.clippingParent(uncached: fresh, transaction: transaction,
                    read: { environment.read(element.axElement, UIElementAttribute(kAXParentAttribute)) }, reportError: reportError)
            })
    }
}
