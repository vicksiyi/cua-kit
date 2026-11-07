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
