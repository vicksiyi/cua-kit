import ApplicationServices

// Shared native wrapper initializer at 0x100721e3c; static role 0x100721db8.
struct MenuItemUIElement: UIElementProtocol {
    let axElement: AXUIElement
    let cache: UIElementCache
    static var role: UIElementRole? { .menuItem }
    init(element: AXUIElement) {
        let value = UIElement(element: element)
        axElement = value.axElement; cache = value.cache
    }
    init(axElement: AXUIElement, cache: UIElementCache) {
        self.axElement = axElement; self.cache = cache
    }
}
