// Buffer routes fb86d8..fb8774, fb8898..fb8920 and fb9274. Return the
// offscreen target, leaving the caller to preserve the original capture ID list.
public func screenshotOffscreenTarget<Window>(selectedWindow: Window?,
    includedWindowIDs: [UInt32]?, cropToFirstWindow: Bool,
    lookup: (UInt32) -> Window?, isOnScreen: (Window) -> Bool
) -> Window? {
    if let selectedWindow, !isOnScreen(selectedWindow) { return selectedWindow }
    if let includedWindowIDs, cropToFirstWindow,
       let firstID = includedWindowIDs.first, let first = lookup(firstID),
       !isOnScreen(first) {
        return first
    }
    return nil
}
