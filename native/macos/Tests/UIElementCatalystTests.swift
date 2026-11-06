import ApplicationServices
import Foundation

@main
struct UIElementCatalystTests {
    static func main() {
        let key = UIElementAttribute.exhibitsMacCatalystBehavior
        precondition(key == UIElementAttribute("_AXExhibitsMacCatalystBehavior"))
        let ax = AXUIElementCreateApplication(424242)
        func partial(_ raw: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: raw), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        let invalid = partial("invalid" as NSString)
        for cached in [nil, partial(NSNumber(value: false)), partial(NSNumber(value: true)), invalid] {
            for fresh in [nil, partial(NSNumber(value: false)), partial(NSNumber(value: true)), invalid] {
                for status: AXError in [.success, .noValue, .attributeUnsupported, .cannotComplete] {
                    var events: [String] = []
                    let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [],
                        attributes: cached.map { [key: $0] } ?? [:], transactionAttributes: nil))
                    let result = item.applicationIsCatalyst(read: { events.append("read"); return (status, fresh) },
                        reportError: { _ in events.append("error") })
                    if let cachedBool = cached.flatMap({ try? decodeAXBool($0.value.value, throwingOnFailure: false) }) {
                        precondition(result == cachedBool && events.isEmpty)
                    } else {
                        let error = status == .cannotComplete || fresh?.value.value === invalid.value.value
                        precondition(events == (error ? ["read", "error"] : ["read"]))
                        let expected = status != .cannotComplete && fresh.flatMap({ try? decodeAXBool($0.value.value, throwingOnFailure: false) }) == true
                        precondition(result == expected)
                    }
                }
            }
        }
        for requested: Set<UIElementAttribute>? in [nil, [], [key]] {
            for supported: Set<UIElementAttribute> in [[], [UIElementAttribute("AXTitle")], [key]] {
                var reads = 0
                let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: supported,
                    attributes: [:], transactionAttributes: requested))
                let result = item.applicationIsCatalyst(read: { reads += 1; return (.success, partial(NSNumber(value: true))) },
                    reportError: { _ in preconditionFailure("unexpected error") })
                let knownUnsupported = (requested?.contains(key) ?? !supported.isEmpty) && !supported.contains(key)
                precondition(result == !knownUnsupported && reads == (knownUnsupported ? 0 : 1))
            }
        }
        print("Catalyst classification preserves cached false, fallback, support gate and strict errors")
    }
}
