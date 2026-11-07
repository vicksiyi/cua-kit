import ApplicationServices

// Source window-like wrappers retain the AX reference and immutable cache.
// Their shared initializer acquires the current transaction and constructs the
// same provider-aware cache as UIElement (0x10071e390 -> 0x10076589c).
// Shared UIElementProtocol defaults supply the recovered inherited behavior.
struct WindowUIElement: WindowUIElementProtocol {
    let axElement: AXUIElement
    let cache: UIElementCache
    static var role: UIElementRole? { .window }
    init(element: AXUIElement) {
        let value = UIElement(element: element)
        axElement = value.axElement; cache = value.cache
    }
    init(axElement: AXUIElement, cache: UIElementCache) {
        self.axElement = axElement; self.cache = cache
    }
    var rawWindowID: UInt32 { get throws { try axElement.windowID } }
    var windowID: UInt32 { get throws { try rawWindowID } }
}

struct SheetUIElement: WindowUIElementProtocol {
    let axElement: AXUIElement
    let cache: UIElementCache
    static var role: UIElementRole? { .sheet }
    init(element: AXUIElement) {
        let value = UIElement(element: element)
        axElement = value.axElement; cache = value.cache
    }
    init(axElement: AXUIElement, cache: UIElementCache) {
        self.axElement = axElement; self.cache = cache
    }
    var rawWindowID: UInt32 { get throws { try axElement.windowID } }
    var windowID: UInt32 { get throws { try rawWindowID } }
}

struct MenuUIElement: WindowUIElementProtocol {
    let axElement: AXUIElement
    let cache: UIElementCache
    static var role: UIElementRole? { .menu }
    init(element: AXUIElement) {
        let value = UIElement(element: element)
        axElement = value.axElement; cache = value.cache
    }
    init(axElement: AXUIElement, cache: UIElementCache) {
        self.axElement = axElement; self.cache = cache
    }
    var rawWindowID: UInt32 { get throws { try axElement.windowID } }
    var windowID: UInt32 { get throws { try systemMenuWindowID(axElement) } }
}
