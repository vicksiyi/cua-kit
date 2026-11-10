import Foundation
@main struct Check {
 static func main() {
  func match(_ names: [String?], _ request: String) -> Int? {
   matchingScreenshotAppWindow(in: Array(names.indices), appName: request, applicationName: { names[$0] })
  }
  precondition(match(["Chrome", "Chrome Canary"], " chrome canary\n") == 1)
  precondition(match(["Chrome Canary"], "Chrome") == 0)
  precondition(match(["ABC app"], "abc") == nil)
  precondition(match([nil, "Other Chrome App"], "CHROME") == 1)
  precondition(match(["Chrome"], "Chrome Canary") == 0)
  precondition(match([nil], "Chrome") == nil)
  precondition(match(["Other"], "Chrome") == nil)
  precondition(match([" \n"], "anything") == 0)
  precondition(match(["😀😀😀 App"], "😀😀😀") == nil)
  print("Screenshot app-name matcher checks passed")
 }
}
