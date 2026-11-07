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
        menuItemsValue(reportError: reportAttributeReadError)
    }
}

extension UIElementProtocol {
    func menuItemsValue(reportError: (Error) -> Void,
        reportChildError: (UIElement, Error) -> Void = { $0.reportAttributeReadError($1) }
    ) -> [MenuItemUIElement] {
        guard let menu = childrenValue(reportError: reportError).first else { return [] }
        return menu.elementCollectionValue(for: UIElementAttribute(kAXChildrenAttribute),
            as: MenuItemUIElement.self, reportError: { reportChildError(menu, $0) })
    }
}

// 0x100723070: search all direct shortcuts first. Only if none matches,
// use the first cached English title "Copy"; descend into that item only.
func findCopyMenuItem<Item>(_ items: [Item], cmdChar: (Item) -> String?,
    cmdModifiers: (Item) -> Int?, title: (Item) -> String?, children: (Item) -> [Item]
) -> Item? {
    for item in items {
        if cmdChar(item) == "C", cmdModifiers(item) == 0 { return item }
    }
    guard let item = items.first(where: { title($0) == "Copy" }) else { return nil }
    let nested = children(item)
    if nested.isEmpty { return item }
    return findCopyMenuItem(nested, cmdChar: cmdChar, cmdModifiers: cmdModifiers,
        title: title, children: children)
}

extension MenuBarItemUIElement {
    var copyItem: MenuItemUIElement? {
        findCopyMenuItem(items, cmdChar: { $0.cmdChar }, cmdModifiers: { $0.cmdModifiers },
            title: { $0.title }, children: { $0.items })
    }
}
