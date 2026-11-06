import Foundation

// Recovered ordered comparisons at 0x100794cec–0x1007953b4.
// Read mutable statics at call time, preserving first-match precedence.
extension UIElementAction {
    var customDescription: String? {
        if self == .press { return "Press" }
        if self == .pick { return "Pick" }
        if self == .increment { return "Increment" }
        if self == .decrement { return "Decrement" }
        if self == .confirm { return "Confirm" }
        if self == .cancel { return "Cancel" }
        if self == .showDefaultUI { return "Show Default UI" }
        if self == .showAlternateUI { return "Show Alternate UI" }
        if self == .raise { return "Raise" }
        if self == .showMenu { return "Show Menu" }
        if self == .scrollToVisible { return "Scroll to Visible" }
        if self == .scrollLeftByPage { return "Scroll Left" }
        if self == .scrollRightByPage { return "Scroll Right" }
        if self == .scrollUpByPage { return "Scroll Up" }
        if self == .scrollDownByPage { return "Scroll Down" }
        if self == .delete { return "Delete" }
        if self == .expand { return "Expand" }
        if self == .collapse { return "Collapse" }
        return scannedActionName(name)
    }
}

// Original 0x1007953b4–0x100795494 uses Foundation.Scanner, including its
// default whitespace handling, not a split/trim substitute.
private func scannedActionName(_ name: String) -> String? {
    guard name.hasPrefix("Name:") else { return nil }
    let scanner = Scanner(string: name)
    guard scanner.scanString("Name:") != nil else { return nil }
    return scanner.scanUpToString("\n")
}

// Description resolver and map callback (0x100793768 and 0x10079716c).
// reportError stands in for the original role-aware logger; its exact logging
// format and provider/transaction dispatch still need restoration.
func uiElementActionDescription(
    _ action: UIElementAction,
    readNativeDescription: (UIElementAction) throws -> String?,
    reportError: (Error) -> Void
) -> (name: String, description: String) {
    if let description = action.customDescription { return (action.name, description) }
    do {
        return (action.name, try readNativeDescription(action) ?? action.name)
    } catch {
        reportError(error)
        return (action.name, action.name)
    }
}
