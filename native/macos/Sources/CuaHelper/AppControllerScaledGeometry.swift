import CoreGraphics

// Arithmetic from 0x100071950. Flags come from CUAStatsigConfig (0x100220914):
// should_use_legacy_screenshot_sizing and
// should_normalize_screenshot_to_point_resolution. Caller owns rect storage.
func appControllerScaledGeometry(visibleRect: CGRect, pixelScale: CGFloat,
    useLegacyScreenshotSizing: Bool, normalizeScreenshotToPointResolution: Bool
) -> (size: CGSize, scalingFactor: CGFloat) {
    let pixelWidth = visibleRect.width * pixelScale
    let pixelHeight = visibleRect.height * pixelScale
    guard useLegacyScreenshotSizing else {
        return (CGSize(width: pixelWidth, height: pixelHeight), 1 / pixelScale)
    }
    let usePoints = normalizeScreenshotToPointResolution && pixelScale > 1
    let width = usePoints ? pixelWidth / pixelScale : pixelWidth
    let height = usePoints ? pixelHeight / pixelScale : pixelHeight
    if width <= 0 || height <= 0 {
        let inverse: CGFloat = 1
        return (CGSize(width: 1, height: 1), usePoints ? (inverse * pixelScale) / pixelScale : inverse / pixelScale)
    }
    let longest = width <= height ? height : width
    var factor = 2048 / longest
    if factor > 1 { factor = 1 }
    let scaledWidth = width * factor
    let scaledHeight = height * factor
    let shortest = scaledHeight < scaledWidth ? scaledHeight : scaledWidth
    var shortFactor = 768 / shortest
    if shortFactor > 1 { shortFactor = 1 }
    factor *= shortFactor
    let inverse = 1 / factor
    return (CGSize(width: width * factor, height: height * factor),
        usePoints ? (inverse * pixelScale) / pixelScale : inverse / pixelScale)
}
