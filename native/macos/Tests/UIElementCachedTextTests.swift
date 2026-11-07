import ApplicationServices
import Foundation

@main
struct UIElementCachedTextTests {
    static func main() {
        let ax = AXUIElementCreateApplication(424242)
        let keys = [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute, kAXValueDescriptionAttribute, kAXRoleDescriptionAttribute, kAXHelpAttribute, kAXIdentifierAttribute, kAXPlaceholderValueAttribute]
        for key in keys {
            for raw: AnyObject? in [nil, "" as NSString, "  text\n" as NSString, NSNumber(value: 7), [] as NSArray, NSNull()] {
                let partial = raw.map { AXPartialValue(value: AXEncodedValue(value: $0), arraySubsetDescriptor: nil, textTruncationDescriptor: nil) }
                // Supported/transaction names do not force a fresh read or hide cached text.
                let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [],
                    attributes: partial.map { [UIElementAttribute(key): $0] } ?? [:], transactionAttributes: []))
                let actual = [item.title, item.description, item.value, item.valueDescription, item.roleDescription, item.help, item.identifier, item.placeholderValue]
                for (index, name) in keys.enumerated() {
                    precondition(actual[index] == (name == key ? raw as? String : nil))
                }
                precondition(item.role == .unknown && item.subrole == nil)
            }
        }
        for (raw, enabled, disclosing): (AnyObject?, Bool, Bool) in [
            (nil, true, false), (kCFBooleanTrue, true, true), (kCFBooleanFalse, false, false),
            (NSNull(), true, false), ("false" as NSString, true, false), ([] as NSArray, true, false)
        ] {
            let partial = raw.map { AXPartialValue(value: AXEncodedValue(value: $0), arraySubsetDescriptor: nil, textTruncationDescriptor: nil) }
            let attributes = partial.map { [UIElementAttribute(kAXEnabledAttribute): $0, UIElementAttribute(kAXDisclosingAttribute): $0] } ?? [:]
            let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [],
                attributes: attributes, transactionAttributes: []))
            precondition(item.isEnabled == enabled && item.isDisclosing == disclosing)
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
