import ApplicationServices
import Foundation

@main
struct UIElementSelectionStateTests {
    static func main() {
        let ax = AXUIElementCreateApplication(424242)
        let selected = UIElementAttribute(kAXSelectedAttribute), focused = UIElementAttribute(kAXFocusedAttribute), traits = UIElementAttribute("AXTraits")
        func partial(_ object: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: object), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        let invalid = partial("bad" as NSString)
        for cached in [nil, partial(NSNumber(value: false)), partial(NSNumber(value: true)), invalid] {
            for mask: UInt64? in [nil, 0, 1, 8, 9, 16, UInt64.max] {
                var calls = 0
                let entries = cached.map { [selected: $0, focused: $0] } ?? [:]
                let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [], attributes: entries, transactionAttributes: nil))
                let result = item.isSelected { calls += 1; return mask }
                let cachedBool = cached.flatMap { try? decodeAXBool($0.value.value, throwingOnFailure: false) } ?? false
                precondition(item.isFocused == cachedBool)
                precondition(result == (cached == nil ? mask.map { $0 & 8 != 0 } ?? false : cachedBool))
                precondition(calls == (cached == nil ? 1 : 0))
            }
        }
        let valid = partial(NSNumber(value: UInt64.max))
        precondition((try! decodeAXUInt64(valid.value.value, throwingOnFailure: true)) == UInt64.max)
        precondition((try! decodeAXUInt64(NSNumber(value: -1), throwingOnFailure: false)) == nil)
        for cached in [nil, invalid, valid] { for status: AXError in [.success, .noValue, .attributeUnsupported, .cannotComplete] {
            var events: [String] = []
            let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [], attributes: cached.map { [traits: $0] } ?? [:], transactionAttributes: nil))
            let result = item.catalystTraitsRawValue(read: { events.append("read"); return (status, valid) }, reportError: { _ in events.append("error") })
            if cached?.value.value === valid.value.value { precondition(result == UInt64.max && events.isEmpty) }
            else if status == .cannotComplete { precondition(result == nil && events == ["read", "error"]) }
            else { precondition(result == UInt64.max && events == ["read"]) }
        } }
        let empty = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil))
        var errors = 0
        precondition(empty.catalystTraitsRawValue(read: { (.success, invalid) }, reportError: { _ in errors += 1 }) == nil && errors == 1)
        print("selection state preserves cached false, absent-only traits fallback and strict traits reads")
    }
}
