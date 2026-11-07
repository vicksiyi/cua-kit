import AppKit
import Animation
import CoreFoundation

// Real system clock only: creates no windows and sends no UI input.
@MainActor
func runDisplayLinkLifecycleChecks() throws -> [String: Any] {
    let onMainThread = Thread.isMainThread
    let onMainRunLoop = CFRunLoopGetCurrent() === CFRunLoopGetMain()
    _ = NSApplication.shared
    guard let screen = NSScreen.main else { throw UIElementError.failedInit("No screen for display-link acceptance") }
    @MainActor final class Probe { var updates: [AnimationUpdate] = [] }
    let probe = Probe()
    var driver: AnimationDriver? = screen.makeAnimationDriver()
    weak var lifetime = driver
    defer { driver?.stop(); driver?.frameCallback = nil }
    driver!.frameCallback = { probe.updates.append($0) }
    guard !driver!.isActive else { throw UIElementError.failedInit("Display link starts active") }
    driver!.start(); driver!.start()
    guard driver!.isActive else { throw UIElementError.failedInit("Display link did not activate") }
    let deadline = Date().addingTimeInterval(1)
    while probe.updates.isEmpty && Date() < deadline {
        _ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.01))
    }
    let finiteFrame = probe.updates.first.map {
        $0.timestamp.isFinite && $0.duration.isFinite && $0.targetTimestamp.isFinite
    } ?? false
    driver!.stop(); driver!.stop()
    guard !driver!.isActive else { throw UIElementError.failedInit("Display link did not stop") }
    let count = probe.updates.count
    let stoppedDeadline = Date().addingTimeInterval(0.05)
    while Date() < stoppedDeadline {
        _ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.01))
    }
    guard probe.updates.count == count else { throw UIElementError.failedInit("Display link delivered after invalidation") }
    driver!.frameCallback = nil
    driver = nil
    guard lifetime == nil else { throw UIElementError.failedInit("Stopped display-link driver was retained") }
    return ["noWindowsOrInput": true, "mainThread": onMainThread, "mainRunLoop": onMainRunLoop,
        "startStopReleasePassed": true, "frames": count, "finiteFrameReceived": finiteFrame]

}
