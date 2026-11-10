import CoreGraphics

struct ScreenshotIncludedDisplayPlan<Window, Display> {
    let windows: [Window]
    let display: Display
    let region: CGRect
}

// Included-ID branch fb8b64..fb9408. Keep resolution before the first-display
// requirement, then region selection before the second display read. The caller
// may supply an error factory for fixtures; default is the recovered error case.
func screenshotIncludedDisplayPlan<Window, Display>(
    includedWindowIDs: [UInt32], cropToFirstWindow: Bool,
    lookup: (UInt32) -> Window?, windowFrame: (Window) -> CGRect,
    displays: () -> [Display], displayFrame: (Display) -> CGRect,
    missingDisplay: () -> Error = { ScreenshotImplementation.Error.screenCaptureFailed }
) throws -> ScreenshotIncludedDisplayPlan<Window, Display> {
    var windows: [Window] = []
    for id in includedWindowIDs {
        if let window = lookup(id) { windows.append(window) }
    }
    guard let first = displays().first else { throw missingDisplay() }
    let region = screenshotWindowRegion(includedWindowIDs: includedWindowIDs,
        cropToFirstWindow: cropToFirstWindow, lookup: lookup,
        resolvedWindows: windows, frame: windowFrame)
    let display = screenshotDisplay(for: region, initialDisplay: first,
        displays: displays, frame: displayFrame)
    return ScreenshotIncludedDisplayPlan(windows: windows, display: display, region: region)
}
