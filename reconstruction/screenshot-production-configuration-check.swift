import CoreGraphics
import ScreenCaptureKit

@main struct Check {
    static func main() {
        // Selected-window sizing uses frame dimensions independently of filter contentRect.
        var reads = 0
        let base = screenshotSingleWindowBaseSize(frame: {
            reads += 1
            return CGRect(x: -200, y: 30, width: 100.25, height: 50.25)
        })
        let size = screenshotCaptureSize(imageSize: nil, baseSize: base, pointPixelScale: { 2 })
        let pixels = screenshotPixelDimensions(size)!
        precondition(reads == 2 && pixels.width == 201 && pixels.height == 101)
        let config = screenshotStreamConfiguration(width: pixels.width, height: pixels.height,
            sourceRect: nil, shouldBeOpaque: false, includeWindowShadow: false)
        precondition(config.width == 201 && config.height == 101)
        precondition(!config.showsCursor && !config.shouldBeOpaque)
        precondition(config.ignoreShadowsSingleWindow && config.ignoreShadowsDisplay)
        let crop = CGRect(x: 10, y: 20, width: 30, height: 40)
        let cropped = screenshotStreamConfiguration(width: 10, height: 20,
            sourceRect: crop, shouldBeOpaque: true, includeWindowShadow: true)
        precondition(cropped.sourceRect == crop && cropped.shouldBeOpaque)
        precondition(!cropped.ignoreShadowsSingleWindow && cropped.ignoreShadowsDisplay)
        print("Screenshot production configuration checks passed")
    }
}
