import AppKit
func report(_ value: [String:Any]) {
    if let data = try? JSONSerialization.data(withJSONObject:value,options:[.sortedKeys]), let text = String(data:data,encoding:.utf8) { print(text); fflush(stdout) }
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
        print("READY"); fflush(stdout)
    }
    func applicationDidBecomeActive(_ notification: Notification) { report(["event": "activation", "active": true]) }
    func applicationDidResignActive(_ notification: Notification) { report(["event": "activation", "active": false]) }
    @objc func save() { result.stringValue = "Saved \(field.stringValue)" }
}
let app = NSApplication.shared
let delegate = Delegate()
app.setActivationPolicy(.regular); app.delegate = delegate; app.run()
