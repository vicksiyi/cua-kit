import Foundation
@main struct Check {
 final class TestError: Error {}
 static func main() async throws {
  let failure = TestError()
  var calls: [String] = []
  let value = try await captureScreenScreenshot(configuration: { calls.append("config"); return 42 }, capture: { config in calls.append("capture"); precondition(config == 42); await Task.yield(); return 7 })
  precondition(value == 7 && calls == ["config", "capture"])
  calls = []
  do {
   let _: Int = try await captureScreenScreenshot(configuration: { () throws -> Int in calls.append("config"); throw failure }, capture: { _ in calls.append("capture"); return 7 })
   preconditionFailure()
  } catch { precondition(error as AnyObject === failure && calls == ["config"]) }
  calls = []
  do {
   let _: Int = try await captureScreenScreenshot(configuration: { 42 }, capture: { _ -> Int in calls.append("capture"); throw failure })
   preconditionFailure()
  } catch { precondition(error as AnyObject === failure && calls == ["capture"]) }
  print("Screen screenshot capture checks passed")
 }
}
