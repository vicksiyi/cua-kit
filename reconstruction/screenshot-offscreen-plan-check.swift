import CoreGraphics
@main struct Check {
 static func main() {
  var calls: [String] = []
  func plan(_ selected: Int?, _ ids: [UInt32]?, _ crop: Bool) -> ScreenshotOffscreenPlan? {
   screenshotOffscreenPlan(selectedWindow: selected, includedWindowIDs: ids, cropToFirstWindow: crop, lookup: { calls.append("lookup"); return Int($0) }, isOnScreen: { calls.append("visible\($0)"); return $0 == 1 }, windowID: { calls.append("id"); return UInt32($0) }, frame: { calls.append("frame"); return CGRect(x: $0, y: 0, width: 20, height: 30) })
  }
  let single = plan(2, [3, 4], true)!
  precondition(single.windowIDs == [2] && single.rect.origin.x == 2 && calls == ["visible2", "id", "frame"])
  calls = []
  let crop = plan(1, [2, 2, 3], true)!
  precondition(crop.windowIDs == [2, 2, 3] && crop.rect.origin.x == 2 && calls == ["visible1", "lookup", "visible2", "frame"])
  precondition(plan(nil, [2], false) == nil)
  print("Screenshot offscreen plan checks passed")
 }
}
