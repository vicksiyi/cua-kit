// Recovered event bodies: 0x10009e7f0 (AX) and 0x10009c9cc (active KVO).
// Observer registration/executor hop remain separate from these MainActor bodies.
@MainActor
protocol CursorAppMonitorWindow: AnyObject {
    var isVisible: Bool { get }
    var wantsToBeVisible: Bool { get set }
    var correspondingWindowID: UInt32? { get set }
    func setAppMonitorOverlay(_ enabled: Bool)
    func updateVisibility()
}

@MainActor
protocol CursorAppMonitorEventStorage: AnyObject {
    var appIsActive: Bool { get set }
    var menusOpen: Int { get set }
    var cursorWindow: (any CursorAppMonitorWindow)? { get }
}

@MainActor
extension CursorAppMonitorEventStorage {
    func applyApplicationActiveChange(_ active: Bool) {
        appIsActive = active
        cursorWindow?.setAppMonitorOverlay(active || menusOpen > 0)
    }

    func handleCursorApplicationNotification(_ notification: AXNotification,
        primaryWindowID: () throws -> UInt32?
    ) {
        if notification == .focusedWindowChanged {
            let id: UInt32
            do {
                guard let observed = try primaryWindowID() else { return }
                id = observed
            } catch { return } // Native discards the window-ID read error.
            guard let window = cursorWindow, window.isVisible else { return }
            window.wantsToBeVisible = true
            window.correspondingWindowID = id
            window.updateVisibility()
            return
        }
        if notification == .menuOpened {
            menusOpen += 1
        } else if notification == .menuClosed {
            // Native uses checked subtraction; no floor at zero or saturation.
            menusOpen -= 1
        } else { return }
        cursorWindow?.setAppMonitorOverlay(appIsActive || menusOpen > 0)
    }
}
