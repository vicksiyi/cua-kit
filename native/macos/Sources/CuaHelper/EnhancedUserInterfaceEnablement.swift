import AppKit

// AXEnablementOperation helper 0x100701230..0x1007019f8. The Spotify path
// alone marks changed and temporarily enforces focus. Other apps only attempt
// the true write. Native/encoding/focus failures do not escape this helper.
func performEnhancedUserInterfaceEnablement<Enforcer: AnyObject>(changed: inout Bool,
    enhancedUserInterface: () -> Bool?, bundleIdentifier: String,
    applicationIsActive: () -> Bool, makeEnforcer: () -> Enforcer,
    enforce: (Enforcer) throws -> Void, deactivate: (Enforcer) throws -> Void,
    makeStartDate: () -> Date = { Date() }, currentDate: () -> Date = { .now },
    sleep: (TimeInterval) -> Void = { Thread.sleep(forTimeInterval: $0) },
    setEnhancedUserInterface: (Bool) throws -> Void) -> Bool {
    guard enhancedUserInterface() == false else { return false }
    var enforcer: Enforcer?
    defer {
        if let enforcer { try? deactivate(enforcer) }
    }
    if bundleIdentifier == "com.spotify.client" {
        changed = true
        if !applicationIsActive() {
            let created = makeEnforcer()
            enforcer = created
            try? enforce(created)
            let start = makeStartDate()
            // Source Date wall-clock gate is inclusive. Check elapsed time
            // BEFORE each active-state read; only then sleep for 50 ms.
            while currentDate().timeIntervalSince(start) <= 1 {
                if applicationIsActive() { break }
                sleep(0.05)
            }
        }
    }
    try? setEnhancedUserInterface(true)
    return true
}

extension UIElement {
    func enableEnhancedUserInterface(changed: inout Bool, bundleIdentifier: String,
        application: NSRunningApplication, window: UIElement?, reportError: @escaping (Error) -> Void) -> Bool {
        let attribute = UIElementAttribute("AXEnhancedUserInterface")
        func send(_ event: SynthesizedEvent) {
            for native in event.cgEvents { dispatchNativeEvent(native, to: application.processIdentifier) }
        }
        return performEnhancedUserInterfaceEnablement(changed: &changed,
            enhancedUserInterface: { booleanValue(for: attribute, ignoringTypeMismatch: true, reportError: reportError) },
            bundleIdentifier: bundleIdentifier, applicationIsActive: { application.isActive },
            makeEnforcer: { SyntheticAppFocusEnforcer.system(pid: application.processIdentifier) },
            enforce: { enforcer in
                try enforcer.enforceActiveState(for: window.map { SyntheticActivationWindow(element: $0, reportError: reportError) }, send: send)
            }, deactivate: { try $0.deactivateFocusEnforcer(send: send) },
            setEnhancedUserInterface: { try setValue($0, forAttribute: attribute) })
    }
}
