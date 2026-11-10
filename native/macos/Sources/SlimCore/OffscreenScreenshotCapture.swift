import CoreGraphics

// Buffer fb8920..fb8930 then fb8934/fb8e60. Capture failure remains nil for
// the caller's error branch. Only resize failure retains a captured image.
public func captureOffscreenScreenshot<Image>(plan: ScreenshotOffscreenPlan, imageSize: CGSize?,
    capture: ([UInt32], CGRect) -> Image?, resize: (Image, CGSize) -> Image?
) -> Image? {
    guard let image = capture(plan.windowIDs, plan.rect) else { return nil }
    return finishOffscreenScreenshot(image, imageSize: imageSize, resize: resize)
}

public func captureOffscreenScreenshot(plan: ScreenshotOffscreenPlan, imageSize: CGSize?) -> CGImage? {
    captureOffscreenScreenshot(plan: plan, imageSize: imageSize,
        capture: { captureAcceleratedWindowScreenshot($0, rect: $1) },
        resize: resizedScreenshotImage)
}
