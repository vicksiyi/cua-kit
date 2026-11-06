import ApplicationServices

extension UIElement {
    // Protocol extension getter 0x1007a80f0: cached AXRole String only.
    // Empty/custom strings remain valid roles; only absence/decode failure
    // falls back to AXUnknown. No fresh AX read or display-label substitution.
    var role: UIElementRole {
        guard let value = cachedStringValue(for: UIElementAttribute(kAXRoleAttribute)) else {
            return .unknown
        }
        return UIElementRole(value)
    }
}
