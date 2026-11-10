// Independent AppKit control, not the restored driver. No windows or input.
// swiftc scripts/display-link-system-control.swift -o /tmp/cua-displaylink-control
// Run once with and once without --finish-launching. Zero frames is not a pass.
import AppKit
import QuartzCore
final class Probe: NSObject {
 var frames=0
 @objc func tick(_ link: CADisplayLink) { frames += 1 }
}
let app=NSApplication.shared
let launch=CommandLine.arguments.contains("--finish-launching")
if launch { app.finishLaunching() }
let probe=Probe()
if let screen=NSScreen.main {
 let link=screen.displayLink(target:probe,selector:#selector(Probe.tick(_:)))
 link.add(to:.current,forMode:.common)
 let deadline=Date().addingTimeInterval(1)
 while Date()<deadline && probe.frames==0 { _=RunLoop.current.run(mode:.default,before:Date().addingTimeInterval(0.01)) }
 link.invalidate()
 print("finishLaunching=\(launch) frames=\(probe.frames) main=\(Thread.isMainThread) maximumFPS=\(screen.maximumFramesPerSecond)")
} else { print("no screen") }
