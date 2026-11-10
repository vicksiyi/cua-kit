import CoreGraphics
@main struct Check {
 static func main() {
  var reads = 0
  let explicit = screenshotCaptureSize(imageSize: CGSize(width: 0, height: -2), baseSize: .zero, pointPixelScale: { reads += 1; return 2 })
  precondition(explicit == CGSize(width: 0, height: -2) && reads == 0)
  let derived = screenshotCaptureSize(imageSize: nil, baseSize: CGSize(width: 100.1, height: 50.2), pointPixelScale: { reads += 1; return 1.5 })
  precondition(derived.width == 100.1 * 1.5 && derived.height == 50.2 * 1.5 && reads == 1)
  let pixels = screenshotPixelDimensions(derived)!
  precondition(pixels.width == 151 && pixels.height == 76)
  precondition(screenshotPixelDimensions(explicit) == nil)
  print("Screenshot capture size checks passed")
 }
}
