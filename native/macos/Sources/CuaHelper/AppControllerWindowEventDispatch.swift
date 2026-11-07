// Source controller callback 0x10006da8c. The owning controller supplies
// concrete wrapper construction, native subscriptions, menu state and focus
// effects. Keep routing/order separate from those native boundaries.
func dispatchAppControllerWindowEvent<Element>(_ notification: AXNotification, element: Element,
    registerWindow: (Element) -> Void, registerSheet: (Element) -> Void,
    clearApplicationAttention: () -> Void, windowCreatedFocusHandling: (Element) -> Void,
    removeDestroyedSubscription: (Element) throws -> Void,
    menuOpened: (Element) -> Void, menuClosed: (Element) -> Void,
    stopSuppressingMenuDismissal: () -> Void, republishObservedWindowIDs: () -> Void) {
    if notification == .windowCreated {
        registerWindow(element)
        clearApplicationAttention()
        windowCreatedFocusHandling(element)
    } else if notification == .uiElementDestroyed {
        try? removeDestroyedSubscription(element)
        stopSuppressingMenuDismissal()
    } else if notification == .menuOpened {
        menuOpened(element)
    } else if notification == .menuClosed {
        menuClosed(element)
        stopSuppressingMenuDismissal()
    } else if notification == .sheetCreated {
        registerSheet(element)
        clearApplicationAttention()
    } else if notification == .windowMoved || notification == .windowResized {
        republishObservedWindowIDs()
    }
}
