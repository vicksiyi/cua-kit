import CoreGraphics

// ScreenshotImplementation helper0x100fb7c00. The upper comparison is inclusive
// at2^63, followed by a checked Swift Int conversion; preserve that original
// boundary trap rather than silently converting it to a nil result.
public func screenshotPixelDimensions(_ size: CGSize) -> (width: Int, height: Int)? {
    guard size.width.isFinite, size.height.isFinite,
          size.width > 0, size.height > 0 else { return nil }
    let width = size.width.rounded(.up)
    let height = size.height.rounded(.up)
    let limit: CGFloat = 9_223_372_036_854_775_808.0
    guard width <= limit, height <= limit else { return nil }
    return (Int(width), Int(height))
}
