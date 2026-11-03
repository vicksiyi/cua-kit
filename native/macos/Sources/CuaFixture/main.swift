import AppKit
// Owned fixture only. Actions on arbitrary user apps are never used for automated tests.
final class Delegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    let field = NSTextField(string: "")
    let result = NSTextField(labelWithString: "Not saved")
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x:120,y:120,width:450,height:240),styleMask:[.titled,.closable],backing:.buffered,defer:false)
        window.title = "Cua Kit native fixture"
        field.frame = NSRect(x:25,y:150,width:250,height:30); field.setAccessibilityLabel("Fixture name")
        let button = NSButton(title:"Save fixture",target:self,action:#selector(save))
        button.frame = NSRect(x:25,y:100,width:160,height:32)
        result.frame = NSRect(x:25,y:40,width:380,height:40)
        window.contentView?.addSubview(field); window.contentView?.addSubview(button); window.contentView?.addSubview(result)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        print("READY"); fflush(stdout)
    }
    @objc func save() { result.stringValue = "Saved \(field.stringValue)" }
}
let app = NSApplication.shared
let delegate = Delegate()
app.setActivationPolicy(.regular); app.delegate = delegate; app.run()
