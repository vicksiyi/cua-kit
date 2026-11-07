import Foundation

extension TransformedUIElement {
    // 0x100759b0c cached String read, then 0x10072bd3c when absent.
    // The property's native name is textualContent but its AX key is Context.
    func textualContext(reportError: (Error) -> Void) -> String? {
        let attribute = UIElementAttribute("AXTextualContext")
        return element.stringValue(for: attribute, ignoringTypeMismatch: false,
            read: { axElement.value(for: attribute) }, reportError: reportError)
    }
}
