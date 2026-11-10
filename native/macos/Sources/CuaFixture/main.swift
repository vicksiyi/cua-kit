import AppKit
import CoreGraphics
private func fixtureArgument(_ name: String) -> String? {
    guard let index = CommandLine.arguments.firstIndex(of: name), index + 1 < CommandLine.arguments.count else { return nil }
    return CommandLine.arguments[index + 1]
}
private let fixtureOutput: FileHandle? = {
    guard !CommandLine.arguments.contains("--launch-owned-fixture"), let path = fixtureArgument("--report-file") else { return nil }
    return FileHandle(forWritingAtPath: path)
}()
private func writeFixtureLine(_ text: String) {
    print(text); fflush(stdout)
    try? fixtureOutput?.write(contentsOf: Data((text + "\n").utf8))
}
func report(_ value: [String:Any]) {
    if let data = try? JSONSerialization.data(withJSONObject:value,options:[.sortedKeys]), let text = String(data:data,encoding:.utf8) { writeFixtureLine(text) }
}
final class GesturePad: NSView {
    var moves = 0
    override var acceptsFirstResponder: Bool { true }
    override func draw(_ dirtyRect: NSRect) { NSColor.systemBlue.setFill(); bounds.fill() }
    override func mouseDown(with event: NSEvent) { moves = 0; report(["event":"pad-down"]) }
    override func mouseDragged(with event: NSEvent) { moves += 1 }
    override func mouseUp(with event: NSEvent) { report(["event":"pad-up","moves":moves]) }
}
final class ScrollDocument: NSView {
    override var isFlipped: Bool { true }
    override func draw(_ dirtyRect: NSRect) {
        NSColor.white.setFill(); bounds.fill()
        for index in 0..<60 { ("Scroll row \(index)" as NSString).draw(at:NSPoint(x:12,y:index*25),withAttributes:[.foregroundColor:NSColor.black]) }
    }
}
// Owned fixture only. Actions on arbitrary user apps are never used for automated tests.
final class Delegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    let field = NSTextField(string: "")
    let result = NSTextField(labelWithString: "Not saved")
    var scrollObserver: NSObjectProtocol?
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x:120,y:120,width:450,height:240),styleMask:[.titled,.closable],backing:.buffered,defer:false)
        window.title = "Cua Kit native fixture"
        field.frame = NSRect(x:25,y:150,width:250,height:30); field.setAccessibilityLabel("Fixture name")
        let button = NSButton(title:"Save fixture",target:self,action:#selector(save))
        button.frame = NSRect(x:25,y:100,width:160,height:32)
        result.frame = NSRect(x:25,y:40,width:380,height:40)
        window.contentView?.addSubview(field); window.contentView?.addSubview(button); window.contentView?.addSubview(result)
        if Bundle.main.object(forInfoDictionaryKey: "CoreFixtureDynamicUpdates") as? Bool == true {
            let ticker = NSTextField(labelWithString: "Tick 0")
            ticker.frame = NSRect(x: 25, y: 10, width: 250, height: 20)
            window.contentView?.addSubview(ticker)
            var tick = 0
            Timer.scheduledTimer(withTimeInterval: 0.03, repeats: true) { _ in
                tick += 1; ticker.stringValue = "Tick \(tick)"
            }
        }
        if CommandLine.arguments.contains("--acceptance") {
            window.setContentSize(NSSize(width:600,height:600))
            field.frame.origin.y = 520; button.frame.origin.y = 470; result.frame.origin.y = 420
            let pad = GesturePad(frame:NSRect(x:25,y:310,width:550,height:80))
            pad.setAccessibilityElement(true); pad.setAccessibilityRole(.group); pad.setAccessibilityLabel("Fixture input pad")
            window.contentView?.addSubview(pad)
            let scroll = NSScrollView(frame:NSRect(x:25,y:50,width:550,height:220))
            scroll.hasVerticalScroller = true; scroll.setAccessibilityLabel("Fixture scroll area")
            scroll.documentView = ScrollDocument(frame:NSRect(x:0,y:0,width:530,height:1500))
            scroll.contentView.postsBoundsChangedNotifications = true
            scrollObserver = NotificationCenter.default.addObserver(forName:NSView.boundsDidChangeNotification,object:scroll.contentView,queue:.main) { _ in
                report(["event":"scroll","offsetY":scroll.contentView.bounds.origin.y])
            }
            window.contentView?.addSubview(scroll)
        }
        if Bundle.main.object(forInfoDictionaryKey: "CoreFixtureBackground") as? Bool == true {
            window.orderBack(nil)
        } else {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        }
        writeFixtureLine("READY")
        if CommandLine.arguments.contains("--ax-event-probe") {
            // Owned notification fixture: move only this newly created window.
            Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { [weak self] _ in
                guard let window = self?.window else { return }
                var origin = window.frame.origin
                origin.x += origin.x.truncatingRemainder(dividingBy: 2) == 0 ? 1 : -1
                window.setFrameOrigin(origin)
            }
        }
        if CommandLine.arguments.contains("--activation-probe") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                let running = NSRunningApplication.current
                report(["event": "activation-probe", "phase": "before", "applicationActive": NSApp.isActive,
                    "runningAppActive": running.isActive, "policy": running.activationPolicy.rawValue,
                    "frontmostIsSelf": NSWorkspace.shared.frontmostApplication?.processIdentifier == running.processIdentifier])
                let accepted = running.activate(options: [])
                report(["event": "activation-probe", "phase": "request", "accepted": accepted])
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                    report(["event": "activation-probe", "phase": "after", "applicationActive": NSApp.isActive,
                        "runningAppActive": running.isActive,
                        "frontmostIsSelf": NSWorkspace.shared.frontmostApplication?.processIdentifier == running.processIdentifier])
                }
            }
        }
    }
    func applicationDidBecomeActive(_ notification: Notification) { report(["event": "activation", "active": true]) }
    func applicationDidResignActive(_ notification: Notification) { report(["event": "activation", "active": false]) }
    @objc func save() { result.stringValue = "Saved \(field.stringValue)" }
}
if CommandLine.arguments.contains("--desktop-session-check") {
    let session = CGSessionCopyCurrentDictionary() as? [String: Any] ?? [:]
    report(["event": "desktop-session", "readOnly": true,
        "screenLocked": session["CGSSessionScreenIsLocked"] as? Bool ?? NSNull(),
        "onConsole": session[kCGSessionOnConsoleKey as String] as? Bool ?? NSNull(),
        "loginDone": session[kCGSessionLoginDoneKey as String] as? Bool ?? NSNull(),
        "frontmostIsLoginWindow": NSWorkspace.shared.frontmostApplication?.bundleIdentifier == "com.apple.loginwindow"])
    exit(0)
}

// LaunchServices is required for a genuine foreground/background acceptance
// precondition. Launch only a temporary bundle containing this exact fixture
// executable. Retain the returned app object and terminate that owned child on
// parent EOF; never look up or terminate arbitrary applications by name/PID.
if let bundlePath = fixtureArgument("--launch-owned-fixture"),
   let outputPath = fixtureArgument("--report-file") {
    let bundle = URL(fileURLWithPath: bundlePath).resolvingSymlinksInPath()
    let output = URL(fileURLWithPath: outputPath).resolvingSymlinksInPath()
    let executable = bundle.appendingPathComponent("Contents/MacOS/CuaFixture")
    guard bundle.path.contains("/cua-owned-click-"),
          bundle.deletingLastPathComponent() == output.deletingLastPathComponent(),
          let ownExecutable = Bundle.main.executableURL,
          FileManager.default.contentsEqual(atPath: ownExecutable.path, andPath: executable.path) else {
        report(["event": "launch-error", "message": "Expected an owned temporary copy of this fixture"])
        exit(2)
    }
    let launcher = NSApplication.shared
    launcher.setActivationPolicy(.prohibited)
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = true
    configuration.createsNewApplicationInstance = true
    configuration.arguments = ["--activation-probe", "--report-file", output.path]
    NSWorkspace.shared.openApplication(at: bundle, configuration: configuration) { child, error in
        guard let child else {
            report(["event": "launch-error", "message": error?.localizedDescription ?? "No running fixture returned"])
            exit(1)
        }
        report(["event": "launched", "pid": Int(child.processIdentifier)])
        DispatchQueue.global().async {
            _ = readLine()
            DispatchQueue.main.async {
                _ = child.terminate()
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                    if !child.isTerminated { _ = child.forceTerminate() }
                    exit(0)
                }
            }
        }
    }
    launcher.run()
    exit(0)
}
let app = NSApplication.shared
let delegate = Delegate()
app.setActivationPolicy(.regular); app.delegate = delegate; app.run()
