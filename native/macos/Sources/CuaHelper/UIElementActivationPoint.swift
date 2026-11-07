import ApplicationServices

extension UIElementProtocol {
    func activationPointValue(read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void) -> CGPoint?? {
        let attribute = UIElementAttribute("AXActivationPoint")
        return uiElementAttributeValue(ignoringTypeMismatch: false, cachedValue: {
            uiElementCachedValue(attribute, readCache: { cache }) {
                try? decodeAXOptionalPoint($0.value.value, throwingOnFailure: false)
            }
        }, uncachedValue: { ignore in
            uiElementUncachedValue(operation: {
                try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                    isKnownUnsupported: { attributeIsKnownUnsupported(attribute) }, read: read,
                    decode: { try? decodeAXOptionalPoint($0.value.value, throwingOnFailure: false) },
                    decodeThrowing: { try decodeAXOptionalPoint($0.value.value, throwingOnFailure: true) })
            }, reportError: reportError)
        })
    }
}

extension SyntheticActivationWindow {
    init(element: any UIElementProtocol, reportError: @escaping (Error) -> Void) {
        self.init(activationPoint: {
            element.activationPointValue(read: { element.axElement.value(for: UIElementAttribute("AXActivationPoint")) },
                reportError: reportError)
        }, windowID: { try element.axElement.windowID }, frame: {
            element.frameValue(readAttribute: { element.axElement.value(for: $0) }, reportError: reportError)
        })
    }
}
