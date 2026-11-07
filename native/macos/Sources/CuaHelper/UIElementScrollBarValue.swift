import ApplicationServices

extension UIElementProtocol {
    // vertical/horizontalScrollBar call value<ScrollBarUIElement> with
    // ignoringTypeMismatch=false (0x100728658..<0x10072870c).
    func scrollBarValue(
        for attribute: UIElementAttribute,
        transaction: UIElementTransactionCache?,
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> ScrollBarUIElement? {
        scrollBarValue(for: attribute,
            initialize: { ScrollBarUIElement(systemElement: $0, transaction: transaction) },
            read: read, reportError: reportError)
    }

    func scrollBarValue(for attribute: UIElementAttribute,
        initialize: (AXUIElement) -> ScrollBarUIElement,
        read: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> ScrollBarUIElement? {
        uiElementAttributeValue(ignoringTypeMismatch: false,
            cachedValue: {
                uiElementCachedValue(attribute, readCache: { cache }) {
                    try? decodeAXScrollBar($0.value.value, throwingOnFailure: false, initialize: initialize)
                }
            }, uncachedValue: { ignore in
                uiElementUncachedValue(operation: {
                    try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                        isKnownUnsupported: { attributeIsKnownUnsupported(attribute) },
                        read: read,
                        decode: { try? decodeAXScrollBar($0.value.value, throwingOnFailure: false, initialize: initialize) },
                        decodeThrowing: { try decodeAXScrollBar($0.value.value, throwingOnFailure: true, initialize: initialize) })
                }, reportError: reportError)
            })
    }

    // Concrete composition; original provider and perform witness are supplied
    // explicitly. Does not replace them with raw calls or skip their policies.
    func scrollUsingSystemScrollBar(
        direction: UIElementScrollDirection,
        transaction: UIElementTransactionCache?,
        read: (AXUIElement, UIElementAttribute) -> (error: AXError, value: AXPartialValue?),
        perform: (UIElement, UIElementAction) throws -> Void,
        reportError: (Error) -> Void
    ) throws -> Bool {
        func bar(_ name: String) -> ScrollBarUIElement? {
            let attribute = UIElementAttribute(name)
            return scrollBarValue(for: attribute, transaction: transaction,
                read: { read(axElement, attribute) }, reportError: reportError)
        }
        func button(_ bar: ScrollBarUIElement, _ selection: ScrollBarPageButton) -> UIElement? {
            bar.pageButton(selection, transaction: transaction,
                readChildren: { read(bar.axElement, UIElementAttribute(kAXChildrenAttribute)) },
                reportError: reportError)
        }
        return try uiElementScrollUsingScrollBar(direction: direction,
            verticalScrollBar: { bar(kAXVerticalScrollBarAttribute) },
            horizontalScrollBar: { bar(kAXHorizontalScrollBarAttribute) },
            decrementPageButton: { button($0, .decrement) },
            incrementPageButton: { button($0, .increment) }, perform: perform)
    }
}
