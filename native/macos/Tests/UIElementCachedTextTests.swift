import ApplicationServices
import Foundation

@main
struct UIElementCachedTextTests {
    static func main() {
        let ax = AXUIElementCreateApplication(424242)
        let keys = [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute, kAXValueDescriptionAttribute]
        for key in keys {
            for raw: AnyObject? in [nil, "" as NSString, "  text\n" as NSString, NSNumber(value: 7), [] as NSArray, NSNull()] {
                let partial = raw.map { AXPartialValue(value: AXEncodedValue(value: $0), arraySubsetDescriptor: nil, textTruncationDescriptor: nil) }
                // Supported/transaction names do not force a fresh read or hide cached text.
                let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [],
                    attributes: partial.map { [UIElementAttribute(key): $0] } ?? [:], transactionAttributes: []))
                let actual = [item.title, item.description, item.value, item.valueDescription]
                for (index, name) in keys.enumerated() {
                    precondition(actual[index] == (name == key ? raw as? String : nil))
                }
                precondition(item.role == .unknown && item.subrole == nil)
            }
        }
        func text(_ value: String) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: value as NSString), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [], attributes: [
            UIElementAttribute(kAXRoleAttribute): text("AXTextField"),
            UIElementAttribute(kAXSubroleAttribute): text("AXSecureTextField"),
            UIElementAttribute(kAXTitleAttribute): text("Password"),
            UIElementAttribute(kAXDescriptionAttribute): text("Secret input"),
            UIElementAttribute(kAXValueAttribute): text("fixture-secret"),
        ], transactionAttributes: nil))
        precondition(item.role == .textField && item.subrole == "AXSecureTextField")
        precondition(item.title == "Password" && item.description == "Secret input")
        // Collector must check subrole before exporting a value; getters don't redact.
        let exported = item.subrole == "AXSecureTextField" ? nil : item.value
        precondition(exported == nil)
        print("cached text preserves absent, empty, malformed and independent fields")
    }
}
