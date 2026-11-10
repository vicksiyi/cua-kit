import CoreGraphics
@main struct Check {
 static func main() {
  let plan = ScreenshotOffscreenPlan(windowIDs: [2, 2, 3], rect: CGRect(x: -90, y: 10, width: 30, height: 40))
  var calls: [String] = []
  let missing: Int? = captureOffscreenScreenshot(plan: plan, imageSize: .zero, capture: { ids, rect in precondition(ids == plan.windowIDs && rect == plan.rect); calls.append("capture"); return nil }, resize: { _, _ in calls.append("resize"); return 9 })
  precondition(missing == nil && calls == ["capture"])
  calls = []
  let original = captureOffscreenScreenshot(plan: plan, imageSize: .zero, capture: { _, _ in calls.append("capture"); return 7 }, resize: { image, size in precondition(image == 7 && size == .zero); calls.append("resize"); return nil })
  precondition(original == 7 && calls == ["capture", "resize"])
  calls = []
  let unchanged = captureOffscreenScreenshot(plan: plan, imageSize: nil, capture: { _, _ in calls.append("capture"); return 7 }, resize: { _, _ in calls.append("resize"); return 9 })
  precondition(unchanged == 7 && calls == ["capture"])
  print("Offscreen screenshot capture checks passed")
 }
}
