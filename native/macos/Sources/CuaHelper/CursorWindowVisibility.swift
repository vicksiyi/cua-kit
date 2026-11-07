// Source Window visibility update 0x10009b1a8. Reset precedes isVisible
// on either hide path. The orderOut dependency must invoke the superclass.
func updateCursorWindowVisibility(
    wantsToBeVisible: () -> Bool, correspondingWindowIsPresent: () -> Bool,
    correspondingWindowID: () -> UInt32?, overlayLevelReason0: () -> Bool,
    overlayLevelReason1: () -> Bool, reset: () -> Void, isVisible: () -> Bool,
    orderOut: () -> Void, orderFront: () -> Void,
    windowLevel: (UInt32) -> Int32?, setLevel: (Int32) -> Void,
    orderAbove: (UInt32) -> Void
) {
    guard wantsToBeVisible(), correspondingWindowIsPresent() else {
        reset()
        if isVisible() { orderOut() }
        return
    }
    guard let id = correspondingWindowID() else { orderFront(); return }
    if overlayLevelReason0() || overlayLevelReason1() { orderFront(); return }
    if let level = windowLevel(id) { setLevel(level) }
    orderAbove(id)
}
