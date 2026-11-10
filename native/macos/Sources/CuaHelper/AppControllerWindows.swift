import ApplicationServices

// Window/menu ownership composition. The controller must serialize dictionary
// access; the source only allocates separate locks for the menu state slots.
final class AppControllerWindows<FocusedMenuBarItem> {
    let menuState = AppControllerMenuState<MenuUIElement, FocusedMenuBarItem>()
    private let registry: MouseWindowRegistry<any WindowUIElementProtocol>
    private let menuDidOpen: () -> Void
    private let menuDidClose: () -> Void

    init(observedWindowIDsChanged: @escaping ([UInt32]) -> Void,
        menuDidOpen: @escaping () -> Void, menuDidClose: @escaping () -> Void) {
        // Pruning validates the raw AX reference. Menu registration below
        // deliberately uses its separate concrete native-menu window ID.
        registry = MouseWindowRegistry(windowID: { try $0.rawWindowID },
            observedWindowIDsChanged: observedWindowIDsChanged)
        self.menuDidOpen = menuDidOpen; self.menuDidClose = menuDidClose
    }
    func register(_ window: any WindowUIElementProtocol) {
        guard let id = try? window.rawWindowID else { return }
        registry.register(window, windowID: id)
    }
    private func registerMenu(_ menu: MenuUIElement) {
        guard let id = try? menu.windowID else { return }
        registry.register(menu, windowID: id)
    }
    func registerWindow(_ element: AXUIElement) { register(WindowUIElement(element: element)) }
    func registerSheet(_ element: AXUIElement) { register(SheetUIElement(element: element)) }

    func initialize(application: UIElement, reportError: @escaping (Error) -> Void) throws {
        try registerAppControllerInitialWindows(primaryWindow: {
            application.primaryWindowValue(reportError: reportError)
        }, registerWindow: {
            register(WindowUIElement(axElement: $0.axElement, cache: $0.cache))
        }, windowChildren: { $0.childrenValue(reportError: reportError) },
        isSheet: { $0.role == .sheet }, registerSheet: { element in
            let sheet = SheetUIElement(element: element.axElement)
            guard let id = try? element.axElement.windowID else { return }
            registry.register(sheet, windowID: id)
        }, children: { $0.childrenValue(reportError: reportError) }, checkpoint: {
            try Task.checkCancellation()
            try requireUnlockedNativeDesktop()
        })
    }
    func openMenu(_ element: AXUIElement) {
        let menu = MenuUIElement(element: element)
        prepareAppControllerMenuOpen(menu, storeMenu: menuState.setOpenedMenu,
            windowID: { try $0.windowID }, registerMenu: { self.registerMenu($0) },
            menuDidOpen: menuDidOpen)
    }
    func closeMenu(_ element: AXUIElement) {
        menuState.menuDidClose(notifyOrdering: menuDidClose, removeWindows: {
            registry.removeWindows { $0.axElement == element }
        })
    }
    func windows() -> [UInt32: any WindowUIElementProtocol] { registry.windows() }
    func orderedWindows(orderedWindowIDs: () -> [UInt32]) -> [any WindowUIElementProtocol] {
        registry.orderedWindows(orderedWindowIDs: orderedWindowIDs)
    }
    func republishObservedWindowIDs() { registry.republishObservedWindowIDs() }
}
