import ApplicationServices

// 0x1006ed1a0: only successful/already-absent native removal updates records.
// Other errors preserve targets and propagate; this is not try?-and-forget.
func removeAXNotification(removeNotification: () -> AXError, removeTarget: () -> Void) throws {
    let error = removeNotification()
    guard error == .success || error == .notificationNotRegistered else {
        throw UIElementError.axError(error)
    }
    removeTarget()
}
