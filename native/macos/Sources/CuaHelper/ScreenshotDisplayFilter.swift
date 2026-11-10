import CoreGraphics
import ScreenCaptureKit

// Display inclusion branch 0x100fb9324..0x100fb9408. The crop uses a
// translation into display coordinates, without clipping or a Y-axis flip.
func screenshotDisplaySourceRect(region: CGRect, displayFrame: CGRect) -> CGRect {
    region.offsetBy(dx: -displayFrame.origin.x, dy: -displayFrame.origin.y)
}

func screenshotDisplayFilter(display: SCDisplay, includedWindows: [SCWindow],
    region: CGRect
) -> (filter: SCContentFilter, sourceRect: CGRect, baseSize: CGSize) {
    let sourceRect = screenshotDisplaySourceRect(region: region, displayFrame: display.frame)
    let filter = SCContentFilter(display: display, including: includedWindows)
    return (filter, sourceRect, CGSize(width: region.width, height: region.height))
}

// No included-ID branch fb8f34..fb9054 receives the first display from
// shareable content and excludes no windows. SCDisplay dimensions are pixels;
// the later shared absent-size branch still applies filter.pointPixelScale.
func screenshotFullDisplayFilter(display: SCDisplay)
    -> (filter: SCContentFilter, baseSize: CGSize, sourceRect: CGRect?) {
    let filter = SCContentFilter(display: display, excludingWindows: [])
    let width = CGFloat(display.width)
    let height = CGFloat(display.height)
    return (filter, CGSize(width: width, height: height), nil)
}
