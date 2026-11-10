@main struct Check {
 enum RefreshError: Error { case incomplete }
 static func main() {
  var order: [String] = []
  let stable = reconcileScreenshotObservation(1, unchanged: true, revokeCoordinates: { order.append("revoke") }, refresh: { order.append("refresh"); return 2 })
  precondition(stable.state == 1 && stable.coordinateInputAvailable && order.isEmpty)
  let changed = reconcileScreenshotObservation(1, unchanged: false, revokeCoordinates: { order.append("revoke") }, refresh: { order.append("refresh"); return 2 })
  precondition(changed.state == 2 && !changed.coordinateInputAvailable && order == ["revoke", "refresh"])
  order = []
  do {
   _ = try reconcileScreenshotObservation(1, unchanged: false, revokeCoordinates: { order.append("revoke") }, refresh: { () throws -> Int in order.append("refresh"); throw RefreshError.incomplete })
   preconditionFailure("Must not publish stale state after refresh failure")
  } catch RefreshError.incomplete { precondition(order == ["revoke", "refresh"]) }
    catch { preconditionFailure() }
  print("Screenshot consistency revocation, refresh and failure checks passed")
 }
}
