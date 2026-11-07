import Foundation

// 0x10006dd30..0x10006deb4: record menu, briefly wait for its AX window
// ID to become readable, register it, then notify the ordering observer.
// A timeout does not prevent registration or the ordering callback. A zero
// window ID is a successful optional value; it is not a retry condition.
func prepareAppControllerMenuOpen<Menu>(_ menu: Menu,
    storeMenu: (Menu) -> Void, windowID: @escaping (Menu) throws -> UInt32,
    wait: (Double, Double, () -> UInt32?) throws -> Void = { timeout, delay, condition in
        try pollUntilTrueSync(timeout: timeout, delay: delay) { condition() != nil }
    }, registerMenu: (Menu) -> Void, menuDidOpen: () -> Void) {
    storeMenu(menu)
    try? wait(0.25, 0.01) { try? windowID(menu) }
    registerMenu(menu)
    menuDidOpen()
}
