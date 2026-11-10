import CoreGraphics
import ScreenCaptureKit

// fb8774..fb87f4: selected on-screen window uses a desktop-independent
// filter. Base dimensions come from separate window.frame width/height reads,
// not filter.contentRect. No explicit sourceRect is configured on this route.
public func screenshotSingleWindowBaseSize(frame: () -> CGRect) -> CGSize {
    let width = frame().width
    let height = frame().height
    return CGSize(width: width, height: height)
}

public func screenshotSingleWindowFilter(window: SCWindow)
    -> (filter: SCContentFilter, baseSize: CGSize, sourceRect: CGRect?) {
    let filter = SCContentFilter(desktopIndependentWindow: window)
    let size = screenshotSingleWindowBaseSize(frame: { window.frame })
    return (filter, size, nil)
}
