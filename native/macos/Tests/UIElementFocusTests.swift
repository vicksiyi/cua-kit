import ApplicationServices
import Foundation

@main
struct UIElementFocusTests {
    enum Failure: Error { case expected }
    static func main() async throws {
        for focusable in [false, true] { for fresh: Bool? in [nil, false, true] { for writeFails in [false, true] {
            var events: [String] = []
            do {
                try await focusUIElementUsingAttributeOrClick(isFocusable: { events.append("capability"); return focusable },
                    setFocused: { events.append("write"); if writeFails { throw Failure.expected } },
                    readUncachedFocused: { events.append("fresh"); return fresh },
                    clickFallback: { events.append("click") })
                precondition(!focusable || !writeFails)
            } catch Failure.expected { precondition(focusable && writeFails) }
            let expected = !focusable ? ["capability", "click"] : writeFails ? ["capability", "write"] : ["capability", "write", "fresh"] + (fresh == true ? [] : ["click"])
            precondition(events == expected)
        } } }
        let ax = AXUIElementCreateApplication(424242), key = UIElementAttribute(kAXFocusedAttribute)
        func partial(_ value: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: value), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        for raw in [NSNumber(value: false) as AnyObject, NSNumber(value: true), "bad" as NSString] {
            var events: [String] = []
            // Cached true must not be used to verify the post-write focus state.
            let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [key], attributes: [key: partial(NSNumber(value: true))], transactionAttributes: nil))
            let environment = UIElementActionEnvironment(read: { _, attribute in
                precondition(attribute == key); events.append("read"); return (.success, partial(raw))
            }, supported: { _ in fatalError("cached support sufficient") }, nativeActions: { _ in fatalError() },
                settable: { _, attribute in precondition(attribute == key); events.append("settable"); return true },
                write: { _, value, attribute in
                    precondition(attribute == key && (try! decodeAXBool(value.value, throwingOnFailure: true)) == true)
                    events.append("write")
                }, perform: { _, _ in fatalError("no AXPress substitute") }, count: { _, _ in fatalError() })
            try await item.focusUsingAttributeOrClick(environment: environment,
                reportError: { _ in events.append("error") }, clickFallback: { events.append("click") })
            let decoded = try? decodeAXBool(raw, throwingOnFailure: true)
            precondition(events == ["settable", "write", "read"] + (decoded == nil ? ["error"] : []) + (decoded == true ? [] : ["click"]))
        }
        var clicked = false
        do {
            try await focusUIElementUsingAttributeOrClick(isFocusable: { false }, setFocused: { fatalError() },
                readUncachedFocused: { fatalError() }, clickFallback: { clicked = true; throw Failure.expected })
            preconditionFailure("click error must propagate")
        } catch Failure.expected { precondition(clicked) }
        print("focus preserves capability gate, fresh verification, click fallback and write errors")
    }
}
