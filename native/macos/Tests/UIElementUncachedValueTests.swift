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
        print("native uncached read preserves support gate, status matrix and decoder policy")
    }
}
