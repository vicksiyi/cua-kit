@main struct Check {
 static func main() {
  var checked: [Int] = []
  var looked: [UInt32] = []
  func target(_ selected: Int?, _ ids: [UInt32]?, _ crop: Bool) -> Int? {
   screenshotOffscreenTarget(selectedWindow: selected, includedWindowIDs: ids, cropToFirstWindow: crop, lookup: { looked.append($0); return $0 == 99 ? nil : Int($0) }, isOnScreen: { checked.append($0); return $0 == 1 })
  }
  precondition(target(2, [3], true) == 2 && checked == [2] && looked.isEmpty)
  checked = []; looked = []
  precondition(target(1, [2, 3], true) == 2 && checked == [1, 2] && looked == [2])
  checked = []; looked = []
  precondition(target(nil, [99, 2], true) == nil && checked.isEmpty && looked == [99])
  looked = []
  precondition(target(nil, [2], false) == nil && looked.isEmpty)
  precondition(target(nil, [], true) == nil)
  print("Screenshot offscreen target checks passed")
 }
}
