import CoreGraphics

// CGImage resize helper fb5490..fb563c. Int conversion truncates toward zero
// and retains Swift's nonfinite/out-of-range trap behavior (not ceil sizing).
public func resizedScreenshotImage(_ image: CGImage, size: CGSize) -> CGImage? {
    guard let colorSpace = image.colorSpace else { return nil }
    if CGFloat(image.width) == size.width && CGFloat(image.height) == size.height {
        return image
    }
    let width = Int(size.width)
    let height = Int(size.height)
    guard let context = CGContext(data: nil, width: width, height: height,
        bitsPerComponent: image.bitsPerComponent, bytesPerRow: 0,
        space: colorSpace, bitmapInfo: image.bitmapInfo.rawValue) else { return nil }
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return context.makeImage()
}

// Offscreen continuation fb8934/fb8e60: absent imageSize bypasses resizing;
// a failed optional resize retains the captured image, without recapture.
public func finishOffscreenScreenshot<Image>(_ image: Image, imageSize: CGSize?,
    resize: (Image, CGSize) -> Image?
) -> Image {
    guard let imageSize else { return image }
    return resize(image, imageSize) ?? image
}

public func finishOffscreenScreenshot(_ image: CGImage, imageSize: CGSize?) -> CGImage {
    finishOffscreenScreenshot(image, imageSize: imageSize, resize: resizedScreenshotImage)
}
