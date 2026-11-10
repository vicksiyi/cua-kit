import CoreGraphics

// fb8874..fb895c: explicit imageSize avoids reading filter.pointPixelScale.
// SDK supplies Float scale, promoted before multiplying dimensions.
func screenshotCaptureSize(imageSize: CGSize?, baseSize: CGSize,
    pointPixelScale: () -> Float
) -> CGSize {
    if let imageSize { return imageSize }
    let scale = CGFloat(pointPixelScale())
    return CGSize(width: baseSize.width * scale, height: baseSize.height * scale)
}
