import ScreenCaptureKit
import CoreGraphics

// Original buffer pathfb8804..fb8ac4. Accelerated capture is a separate
// branch; this configuration belongs to the ScreenCaptureKit branch.
public func screenshotStreamConfiguration(shouldBeOpaque: Bool,
    includeWindowShadow: Bool
) -> SCStreamConfiguration {
    let configuration = SCStreamConfiguration()
    configuration.ignoreShadowsSingleWindow = !includeWindowShadow
    configuration.ignoreShadowsDisplay = true
    configuration.showsCursor = false
    configuration.shouldBeOpaque = shouldBeOpaque
    return configuration
}

public func screenshotStreamConfiguration(width: Int, height: Int, sourceRect: CGRect?,
    shouldBeOpaque: Bool, includeWindowShadow: Bool
) -> SCStreamConfiguration {
    let configuration = screenshotStreamConfiguration(shouldBeOpaque: shouldBeOpaque,
        includeWindowShadow: includeWindowShadow)
    configuration.width = width
    configuration.height = height
    if let sourceRect { configuration.sourceRect = sourceRect }
    return configuration
}

public func screenshotStreamConfiguration(filter: SCContentFilter, baseSize: CGSize,
    imageSize: CGSize?, sourceRect: CGRect?, shouldBeOpaque: Bool,
    includeWindowShadow: Bool
) -> SCStreamConfiguration? {
    let size = screenshotCaptureSize(imageSize: imageSize, baseSize: baseSize,
        pointPixelScale: { filter.pointPixelScale })
    guard let dimensions = screenshotPixelDimensions(size) else { return nil }
    return screenshotStreamConfiguration(width: dimensions.width, height: dimensions.height,
        sourceRect: sourceRect, shouldBeOpaque: shouldBeOpaque,
        includeWindowShadow: includeWindowShadow)
}
