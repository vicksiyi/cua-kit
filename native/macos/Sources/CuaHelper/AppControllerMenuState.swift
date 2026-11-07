import os

// Controller slots at 0x1000477e8/0x100047824 are separately allocated locks.
// They are not one combined state lock and do not own the window dictionary.
final class AppControllerMenuState<Menu, MenuBarItem> {
    private let opened = OSAllocatedUnfairLock<Menu?>(initialState: nil)
    private let focused = OSAllocatedUnfairLock<MenuBarItem?>(initialState: nil)

    var openedMenu: Menu? { opened.withLock { $0 } }
    var focusedMenuBarItem: MenuBarItem? { focused.withLock { $0 } }
    func setOpenedMenu(_ menu: Menu?) { opened.withLock { $0 = menu } }
    func setFocusedMenuBarItem(_ item: MenuBarItem?) { focused.withLock { $0 = item } }

    // 0x10006e11c..0x10006e228: cancel ordering menu task first, clear the
    // two slots independently, then inspect/remove matching window records.
    func menuDidClose(notifyOrdering: () -> Void, removeWindows: () -> Void) {
        notifyOrdering()
        opened.withLock { $0 = nil }
        focused.withLock { $0 = nil }
        removeWindows()
    }
}
