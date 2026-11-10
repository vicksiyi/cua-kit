import ApplicationServices

// ApplicationUIElement has the same AX reference/cache storage and shared
// protocol defaults as other typed AX wrappers. PID construction0x10071795c
// creates the application handle before the existing provider cache initializer.
struct ApplicationUIElement: UIElementProtocol {
    static var role: UIElementRole? { .application }
    let axElement: AXUIElement
    let cache: UIElementCache

    init(element: AXUIElement) {
        let value = UIElement(element: element)
        axElement = value.axElement
        cache = value.cache
    }
    init(pid: pid_t) { self.init(element: AXUIElementCreateApplication(pid)) }
    init(axElement: AXUIElement, cache: UIElementCache) {
        self.axElement = axElement
        self.cache = cache
    }
}
