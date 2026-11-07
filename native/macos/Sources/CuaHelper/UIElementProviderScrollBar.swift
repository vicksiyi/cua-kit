import ApplicationServices

extension ScrollBarUIElement {
    init(element: AXUIElement) {
        let transaction = UIElementTreeTransaction.current?.cache
        self.init(axElement: element, cache: constructProviderUIElementCache(element: element, transaction: transaction))
    }

    func pageButton(_ selection: ScrollBarPageButton, reportError: (Error) -> Void) -> UIElement? {
        let element = UIElement(axElement: axElement, cache: cache)
        return selection.find(in: element.childrenValue(reportError: reportError))
    }
}

extension UIElement {
    func scrollBarValue(for attribute: UIElementAttribute, reportError: (Error) -> Void) -> ScrollBarUIElement? {
        scrollBarValue(for: attribute, initialize: { ScrollBarUIElement(element: $0) },
            read: { axElement.value(for: attribute) }, reportError: reportError)
    }

    func scrollUsingScrollBar(direction: UIElementScrollDirection,
        perform: (UIElement, UIElementAction) throws -> Void,
        reportError: (Error) -> Void
    ) throws -> Bool {
        try uiElementScrollUsingScrollBar(direction: direction,
            verticalScrollBar: { scrollBarValue(for: UIElementAttribute(kAXVerticalScrollBarAttribute), reportError: reportError) },
            horizontalScrollBar: { scrollBarValue(for: UIElementAttribute(kAXHorizontalScrollBarAttribute), reportError: reportError) },
            decrementPageButton: { $0.pageButton(.decrement, reportError: reportError) },
            incrementPageButton: { $0.pageButton(.increment, reportError: reportError) }, perform: perform)
    }
}
