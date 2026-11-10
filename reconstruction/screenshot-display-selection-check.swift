import CoreGraphics
@main struct Check {
 static func main() {
  let frames = [CGRect(x: 0, y: 0, width: 100, height: 100), CGRect(x: 100, y: 0, width: 100, height: 100)]
  var reads: [Int] = []
  let chosen = screenshotDisplay(for: CGRect(x: 90, y: 0, width: 100, height: 10), displays: [0, 1], frame: { reads.append($0); return frames[$0] })
  precondition(chosen == 1 && reads == [0, 1])
  precondition(screenshotDisplay(for: CGRect(x: 90, y: 0, width: 20, height: 10), displays: [0, 1], frame: { frames[$0] }) == 0)
  precondition(screenshotDisplay(for: CGRect(x: 500, y: 0, width: 20, height: 10), displays: [0, 1], frame: { frames[$0] }) == 0)
  let none: Int? = screenshotDisplay(for: .zero, displays: [], frame: { _ in preconditionFailure() })
  precondition(none == nil)
  reads = []
  precondition(screenshotDisplay(for: .zero, displays: [0], frame: { reads.append($0); return frames[$0] }) == 0 && reads.isEmpty)
  var inventories = 0
  let retained = screenshotDisplay(for: .zero, initialDisplay: 9, displays: { inventories += 1; return [] }, frame: { _ in preconditionFailure() })
  precondition(retained == 9 && inventories == 1)
  let replaced = screenshotDisplay(for: CGRect(x: 110, y: 0, width: 10, height: 10), initialDisplay: 9, displays: { [0, 1] }, frame: { frames[$0] })
  precondition(replaced == 1)
  print("Screenshot display selection checks passed")
 }
}
