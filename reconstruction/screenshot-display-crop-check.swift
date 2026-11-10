import CoreGraphics
@main struct Check {
 static func main() {
  let source = screenshotDisplaySourceRect(region: CGRect(x: -1800, y: 250, width: 800, height: 600), displayFrame: CGRect(x: -1920, y: 100, width: 1920, height: 1080))
  precondition(source == CGRect(x: 120, y: 150, width: 800, height: 600))
  let outside = screenshotDisplaySourceRect(region: CGRect(x: 90, y: -50, width: 200, height: 200), displayFrame: CGRect(x: 100, y: 0, width: 100, height: 100))
  precondition(outside == CGRect(x: -10, y: -50, width: 200, height: 200))
  print("Screenshot display crop checks passed")
 }
}
