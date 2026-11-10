import CoreGraphics
@main struct Check {
 static func main() {
  let frames = [1: CGRect(x: -20, y: 10, width: 30, height: 40), 2: CGRect(x: 50, y: 0, width: 20, height: 20)]
  var reads: [Int] = []
  var lookups: [UInt32] = []
  func region(_ ids: [UInt32], _ crop: Bool, _ resolved: [Int]) -> CGRect {
   screenshotWindowRegion(includedWindowIDs: ids, cropToFirstWindow: crop, lookup: { lookups.append($0); return frames[Int($0)] == nil ? nil : Int($0) }, resolvedWindows: resolved, frame: { reads.append($0); return frames[$0]! })
  }
  precondition(region([1, 2], true, [1, 2]) == frames[1]! && reads == [1] && lookups == [1])
  reads = []; lookups = []
  precondition(region([99, 2], true, [2]) == frames[2]! && reads == [2] && lookups == [99])
  reads = []; lookups = []
  precondition(region([1, 2], false, [1, 2]) == frames[1]!.union(frames[2]!) && reads == [1, 2] && lookups.isEmpty)
  precondition(region([], true, []).isNull)
  print("Screenshot window region checks passed")
 }
}
