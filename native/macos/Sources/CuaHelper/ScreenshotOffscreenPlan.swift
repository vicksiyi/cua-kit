import CoreGraphics

struct ScreenshotOffscreenPlan {
    let windowIDs: [UInt32]
    let rect: CGRect
}

// Selected-window branch builds a singleton ID array. Crop-first branch jumps
// past that allocation and retains all requested IDs, including duplicates.
func screenshotOffscreenPlan<Window>(selectedWindow: Window?,
    includedWindowIDs: [UInt32]?, cropToFirstWindow: Bool,
    lookup: (UInt32) -> Window?, isOnScreen: (Window) -> Bool,
    windowID: (Window) -> UInt32, frame: (Window) -> CGRect
) -> ScreenshotOffscreenPlan? {
    if let selectedWindow, !isOnScreen(selectedWindow) {
        let ids = [windowID(selectedWindow)]
        return ScreenshotOffscreenPlan(windowIDs: ids, rect: frame(selectedWindow))
    }
    if let includedWindowIDs, cropToFirstWindow,
       let firstID = includedWindowIDs.first, let first = lookup(firstID),
       !isOnScreen(first) {
        return ScreenshotOffscreenPlan(windowIDs: includedWindowIDs, rect: frame(first))
    }
    return nil
}
