import CoreGraphics

// Mutating wrapper0x100071950: visibleRect is written before arithmetic;
// scalingFactor and scaledScreenSize are written in that order afterward.
@discardableResult
func updateAppControllerGeometry(visibleRect: CGRect, pixelScale: CGFloat,
    useLegacyScreenshotSizing: Bool, normalizeScreenshotToPointResolution: Bool,
    writeVisibleRect: (CGRect) -> Void,
    writeScalingFactor: (CGFloat) -> Void,
    writeScaledScreenSize: (CGSize) -> Void
) -> CGSize {
    writeVisibleRect(visibleRect)
    let result = appControllerScaledGeometry(visibleRect: visibleRect, pixelScale: pixelScale,
        useLegacyScreenshotSizing: useLegacyScreenshotSizing,
        normalizeScreenshotToPointResolution: normalizeScreenshotToPointResolution)
    writeScalingFactor(result.scalingFactor)
    writeScaledScreenSize(result.size)
    return result.size
}
