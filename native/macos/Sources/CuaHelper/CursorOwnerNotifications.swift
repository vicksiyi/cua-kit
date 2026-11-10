import AppKit

let computerUseCursorLocationDidChangeNotification = Notification.Name("computerUseCursorLocationDidChange")
let computerUseCursorDidFinishMoveNotification = Notification.Name("computerUseCursorDidFinishMove")
let computerUseCursorDidHideNotification = Notification.Name("computerUseCursorDidHide")

@MainActor
func installCursorOwnerNotifications(_ owner: NSObject, window: NSWindow, selector: Selector) {
    NotificationCenter.default.addObserver(owner, selector: selector,
        name: NSWindow.didMoveNotification, object: window)
}

func removeCursorOwnerNotifications(_ owner: NSObject) {
    NotificationCenter.default.removeObserver(owner)
}

// Native windowDidMove body 0x100093da4 invokes the current weak delegate
// first, then posts the owner as object. It does not recompute geometry here.
@MainActor
func notifyCursorOwnerMoved(_ owner: NSObject, delegate: () -> Void) {
    delegate()
    NotificationCenter.default.post(name: computerUseCursorLocationDidChangeNotification, object: owner)
}
