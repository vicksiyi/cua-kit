import CoreGraphics
@main struct Check {
 static func main() {
  let context = CGContext(data: nil, width: 4, height: 4, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  context.setFillColor(CGColor(red: 1, green: 0, blue: 0, alpha: 1))
  context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
  let image = context.makeImage()!
  precondition(resizedScreenshotImage(image, size: CGSize(width: 4, height: 4)) === image)
  let resized = resizedScreenshotImage(image, size: CGSize(width: 2.9, height: 3.8))!
  precondition(resized.width == 2 && resized.height == 3)
  precondition(resized.bitsPerComponent == image.bitsPerComponent && resized.bitmapInfo == image.bitmapInfo)
  var attempts = 0
  precondition(finishOffscreenScreenshot(7, imageSize: nil, resize: { _, _ in attempts += 1; return 8 }) == 7 && attempts == 0)
  precondition(finishOffscreenScreenshot(7, imageSize: .zero, resize: { _, _ in attempts += 1; return nil }) == 7 && attempts == 1)
  precondition(finishOffscreenScreenshot(7, imageSize: CGSize(width: 2, height: 3), resize: { original, size in precondition(original == 7 && size.width == 2); return 8 }) == 8)
  print("Screenshot image resize checks passed")
 }
}
