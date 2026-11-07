import ApplicationServices

extension UIElementAttribute {
    static let dateTimeComponents = UIElementAttribute("AXDateTimeComponents")
}

extension UIElement {
    func dateTimeComponentsValue(reportError: (Error) -> Void) -> Int? {
        dateTimeComponentsValue(read: { axElement.value(for: .dateTimeComponents) },
            reportError: reportError)
    }

    // Source 0x10075bffc..<0x10075c408. Cache decode is lenient; a
    // missing/invalid cached integer falls through to a strict provider read.
    func dateTimeComponentsValue(
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> Int? {
        let attribute = UIElementAttribute.dateTimeComponents
        return uiElementAttributeValue(ignoringTypeMismatch: false,
            cachedValue: {
                uiElementCachedValue(attribute, readCache: { cache }) {
                    try? decodeAXInt($0.value.value, throwingOnFailure: false)
                }
            }, uncachedValue: { ignore in
                uiElementUncachedValue(operation: {
                    try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                        isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
                        read: read,
                        decode: { try? decodeAXInt($0.value.value, throwingOnFailure: false) },
                        decodeThrowing: { try decodeAXInt($0.value.value, throwingOnFailure: true) })
                }, reportError: reportError)
            })
    }

    func transformedDateFormat(reportError: (Error) -> Void,
        reportUnknown: (UInt) -> Void
    ) -> TransformedUIElementDateFormat {
        transformedUIElementDateFormat(components: dateTimeComponentsValue(reportError: reportError),
            reportUnknown: reportUnknown)
    }

    func formattedTransformedValue(_ raw: AnyObject, reportError: (Error) -> Void,
        reportUnknownDateComponents: (UInt) -> Void
    ) -> String? {
        transformedUIElementFormattedValue(raw, classify: transformedValueType,
            dateFormat: { transformedDateFormat(reportError: reportError,
                reportUnknown: reportUnknownDateComponents) })
    }
}
