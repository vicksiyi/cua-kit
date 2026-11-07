import ApplicationServices

extension UIElementTree where Element: UIElementProtocol {
    /// Native provider overloads at 0x10076abb0, 0x10076ac10, 0x10076ac98.
    /// Extract the AX handle from the supplied provider, then use the tree's
    /// existing identity/path table. No fresh attribute reads or title matching.
    mutating func id(for provider: any UIElementProtocol) -> Int? {
        id(for: provider.axElement)
    }

    mutating func element(for provider: any UIElementProtocol) -> Element? {
        guard let index = id(for: provider) else { return nil }
        return element(for: index)
    }

    @discardableResult
    mutating func setFocusedElement(_ provider: any UIElementProtocol) -> Element? {
        setFocusedElement(identity: provider.axElement)
    }
}
