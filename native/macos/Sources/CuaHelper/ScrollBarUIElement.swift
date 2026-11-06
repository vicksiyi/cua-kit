import ApplicationServices

// Native descriptor 0x1012cc950 / fields 0x10132336c: immutable axElement/cache.
// This restores concrete storage without inventing the still-incomplete protocol.
struct ScrollBarUIElement {
    static let role: UIElementRole? = .scrollBar
    let axElement: AXUIElement
    let cache: UIElementCache

    // Original 0x100717a54 -> 0x10071e390 reads current transaction once and
    // calls the shared cache constructor; it does not validate the element role.
    init(systemElement: AXUIElement, transaction: UIElementTransactionCache?) {
        axElement = systemElement
        cache = constructSystemUIElementCache(element: systemElement, transaction: transaction)
    }

    // The original getters share the collection accessor and return the first
    // matching UIElement. Provider/logger/context remain explicit dependencies.
    func pageButton(
        _ selection: ScrollBarPageButton,
        transaction: UIElementTransactionCache?,
        readChildren: () -> (error: AXError, value: AXPartialValue?),
        reportError: (Error) -> Void
    ) -> UIElement? {
        let element = UIElement(axElement: axElement, cache: cache)
        let children = element.systemElementCollectionValue(
            for: UIElementAttribute(kAXChildrenAttribute), transaction: transaction,
            read: readChildren, reportError: reportError)
        return selection.find(in: children)
    }
}
