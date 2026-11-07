import ApplicationServices

// Source MenuBarItemUIElement init at 0x100724de0 shares the generic
// wrapper/cache constructor; static role at 0x1007229cc is .menuBarItem.
// This restores storage and the inherited UIElementProtocol contract used by
// the controller slot. Menu-item search conveniences are not restored here.
struct MenuBarItemUIElement: UIElementProtocol {
    let axElement: AXUIElement
    let cache: UIElementCache
    static var role: UIElementRole? { .menuBarItem }
    init(element: AXUIElement) {
        let value = UIElement(element: element)
        axElement = value.axElement; cache = value.cache
    }
    init(axElement: AXUIElement, cache: UIElementCache) {
        self.axElement = axElement; self.cache = cache
    }
}

extension MenuBarItemUIElement {
    // 0x100722ae0: take only the first direct child, then decode that child's
    // AXChildren as MenuItemUIElement. No role filter or sibling traversal.
    var items: [MenuItemUIElement] {
        itemsValue(reportError: reportAttributeReadError)
    }
    func itemsValue(reportError: (Error) -> Void,
        reportChildError: (UIElement, Error) -> Void = { $0.reportAttributeReadError($1) }
    ) -> [MenuItemUIElement] {
        guard let menu = childrenValue(reportError: reportError).first else { return [] }
        return menu.elementCollectionValue(for: UIElementAttribute(kAXChildrenAttribute),
            as: MenuItemUIElement.self, reportError: { reportChildError(menu, $0) })
    }
}
