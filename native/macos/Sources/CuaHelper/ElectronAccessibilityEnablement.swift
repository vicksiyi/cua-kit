import ApplicationServices

// AXEnablementOperation manual helper 0x100700d78..0x100701230. Only an
// explicit false read leads to a write attempt. The returned Bool describes
// that attempt, not verified AX success: encoding/setter failures are ignored
// and the shared changed flag is still set. Nil/true preserve that flag.
func performElectronAccessibilityEnablement(changed: inout Bool,
    manualAccessibility: () -> Bool?, setManualAccessibility: (Bool) throws -> Void) -> Bool {
    guard manualAccessibility() == false else { return false }
    try? setManualAccessibility(true)
    changed = true
    return true
}

extension UIElement {
    func enableElectronAccessibility(changed: inout Bool, reportError: (Error) -> Void) -> Bool {
        let attribute = UIElementAttribute("AXManualAccessibility")
        return performElectronAccessibilityEnablement(changed: &changed,
            manualAccessibility: {
                booleanValue(for: attribute, ignoringTypeMismatch: true, reportError: reportError)
            }, setManualAccessibility: { value in
                try setValue(value, forAttribute: attribute)
            })
    }
}
