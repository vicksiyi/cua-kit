@main struct Check {
 enum Stop: Error { case requested }
 static func main() {
  var visits = 0, checkpoints = 0
  do {
   try registerAppControllerInitialWindows(primaryWindow: { 0 }, registerWindow: { _ in }, windowChildren: { _ in [1] }, isSheet: { _ in false }, registerSheet: { _ in }, children: { value in visits += 1; return [value] }, checkpoint: {
    checkpoints += 1
    if checkpoints == 5 { throw Stop.requested }
   })
   preconditionFailure("Cycle should remain interruptible")
  } catch Stop.requested { precondition(visits == 3 && checkpoints == 5) }
    catch { preconditionFailure() }
  var order: [Int] = []
  registerAppControllerInitialWindows(primaryWindow: { 0 }, registerWindow: { _ in }, windowChildren: { _ in [1, 2, 1] }, isSheet: { _ in false }, registerSheet: { _ in }, children: { value in order.append(value); return [] })
  precondition(order == [1, 2, 1])
  print("Initial window interruption and duplicate order checks passed")
 }
}
