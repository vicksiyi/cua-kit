import ApplicationServices
import Foundation

@main
struct UIElementUncachedValueTests {
    static func main() throws {
        let raw = "cached" as NSString
        let partial = AXPartialValue(value: AXEncodedValue(value: raw), arraySubsetDescriptor: nil,
            textTruncationDescriptor: AXTruncationDescriptor(count: 20, availableRange: 0..<6))
        let statuses: [AXError] = [.success, .noValue, .attributeUnsupported, .cannotComplete, .failure]
        for unsupported in [false, true] {
            for status in statuses {
                for present in [false, true] {
                    for ignore in [false, true] {
                        var events: [String] = []
                        let accepted = status == .success || status == .noValue || status == .attributeUnsupported
                        do {
                            let result: String? = try uiElementUncachedValueThrowing(ignoringTypeMismatch: ignore,
                                isKnownUnsupported: { events.append("support"); return unsupported },
                                read: { events.append("read"); return (status, present ? partial : nil) },
                                decode: { entry in
                                    precondition(entry.value.value === raw && entry.textTruncationDescriptor == partial.textTruncationDescriptor)
                                    events.append("decode"); return "lenient"
                                }, decodeThrowing: { _ in events.append("strict"); return "strict" })
                            if unsupported { precondition(result == nil && events == ["support"]) }
                            else {
                                precondition(accepted)
                                precondition(result == (present ? (ignore ? "lenient" : "strict") : nil))
                                precondition(events == (["support", "read"] + (present ? [ignore ? "decode" : "strict"] : [])))
                            }
                        } catch UIElementError.axError(let actual) {
                            precondition(!unsupported && !accepted && actual == status && events == ["support", "read"])
                        }
                    }
                }
            }
        }
        // Strict decoder failure propagates to the outer logging accessor.
        do {
            let _: String? = try uiElementUncachedValueThrowing(ignoringTypeMismatch: false,
                isKnownUnsupported: { false }, read: { (.success, partial) },
                decode: { _ in preconditionFailure("Wrong decoder") },
                decodeThrowing: { _ in throw UIElementError.failedToUnwrapAttributeValue(String.self) })
            preconditionFailure("Expected decoder error")
        } catch UIElementError.failedToUnwrapAttributeValue(let type) { precondition(type == String.self) }
        let key = UIElementAttribute("AXTitle")
        let element = AXUIElementCreateApplication(424242)
        func item(_ attributes: [UIElementAttribute: AXPartialValue], requested: Set<UIElementAttribute>? = nil) -> UIElement {
            UIElement(axElement: element, cache: UIElementCache(supportedAttributes: Set(attributes.keys), attributes: attributes, transactionAttributes: requested))
        }
        var events: [String] = []
        let cached = item([key: partial]).stringValue(for: key, ignoringTypeMismatch: false,
            read: { preconditionFailure("Cache hit must not read") }, reportError: { _ in preconditionFailure("No error") })
        precondition(cached == "cached")
        let unsupported = item([:], requested: [key]).stringValue(for: key, ignoringTypeMismatch: false,
            read: { preconditionFailure("Known unsupported must not read") }, reportError: { _ in preconditionFailure("No error") })
        precondition(unsupported == nil)
        let invalid = AXPartialValue(value: AXEncodedValue(value: NSNumber(value: 4)), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        for ignore in [false, true] {
            events = []
            let result = item([key: invalid]).stringValue(for: key, ignoringTypeMismatch: ignore,
                read: { events.append("read"); return (.success, invalid) },
                reportError: { error in
                    guard case UIElementError.failedToUnwrapAttributeValue(let type) = error else { preconditionFailure("Wrong error") }
                    precondition(type == String.self); events.append("error")
                })
            precondition(result == nil && events == (ignore ? ["read"] : ["read", "error"]))
        }
        events = []
        let failed = item([:]).stringValue(for: key, ignoringTypeMismatch: true,
            read: { events.append("read"); return (.cannotComplete, partial) },
            reportError: { error in
                guard case UIElementError.axError(.cannotComplete) = error else { preconditionFailure("Lost AXError") }
                events.append("error")
            })
        precondition(failed == nil && events == ["read", "error"])
        let refreshed = item([key: invalid]).stringValue(for: key, ignoringTypeMismatch: false,
            read: { (.success, partial) }, reportError: { _ in preconditionFailure("No error") })
        precondition(refreshed == "cached")
        print("native uncached read preserves support gate, status matrix and decoder policy")
    }
}
