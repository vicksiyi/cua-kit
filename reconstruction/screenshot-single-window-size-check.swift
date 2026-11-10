import CoreGraphics
@main struct Check {
 static func main() {
  var calls = 0
  let size = screenshotSingleWindowBaseSize(frame: {
   calls += 1
   return calls == 1 ? CGRect(x: -10, y: 20, width: 30, height: 40) : CGRect(x: 10, y: 30, width: 50, height: 60)
  })
  precondition(size == CGSize(width: 30, height: 60) && calls == 2)
  print("Screenshot single window base size checks passed")
 }
}
