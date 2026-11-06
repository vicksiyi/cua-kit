import ApplicationServices
import Foundation

@main
struct UIElementDisclosureActionsTests {
    static func main() throws {
        let key = UIElementAttribute("AXDisclosing")
        let other = UIElementAttribute("AXTitle")
        let requestedCases: [Set<UIElementAttribute>?] = [nil, [], [key], [other]]
        let values: [AnyObject?] = [nil, NSNumber(value: true), NSNumber(value: false), "true" as NSString, NSNull()]
        var count = 0
        for requested in requestedCases {
            for cachedSupports in [false, true] {
                for freshSupports in [false, true] {
                    for writable in [0, 1, 2] { // false, true, AX error
                        for raw in values {
                            var attributes: [UIElementAttribute: AXPartialValue] = [:]
                            if let raw {
                                attributes[key] = AXPartialValue(value: AXEncodedValue(value: raw), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
                            }
                            let cache = UIElementCache(supportedAttributes: cachedSupports ? [key] : [], attributes: attributes, transactionAttributes: requested)
                            var reads = 0, checks = 0
                            let result = uiElementDisclosureActions(cache: cache, freshSupportedAttributes: {
                                reads += 1
                                return freshSupports ? [key] : []
                            }, isAttributeSettable: { attribute in
                                precondition(attribute == key)
                                checks += 1
                                if writable == 2 { throw UIElementError.axError(.cannotComplete) }
                                return writable == 1
                            })
                            let useFresh = requested != nil && !requested!.contains(key)
                            let supported = useFresh ? freshSupports : cachedSupports
                            precondition(reads == (useFresh ? 1 : 0))
                            precondition(checks == (supported ? 1 : 0))
                            let expected: [UIElementAction] = supported && writable == 1
                                ? [(raw as? Bool) == true ? .collapse : .expand] : []
                            precondition(result == expected)
                            count += 1
                        }
                    }
                }
            }
        }
        for allowed in [false, true] {
            for current in [false, true] {
                var calls: [String] = []
                uiElementToggleDisclosure(isDisclosable: {
                    calls.append("check"); return allowed
                }, isDisclosing: {
                    calls.append("read"); return current
                }, setDisclosing: { next in
                    precondition(next == !current); calls.append("write")
                })
                precondition(calls == (allowed ? ["check", "read", "write"] : ["check"]))
            }
        }
        var writes = 0
        do {
            try uiElementToggleDisclosure(isDisclosable: { true }, isDisclosing: { false },
                setDisclosing: { _ in writes += 1; throw UIElementError.axError(.cannotComplete) })
            fatalError("disclosure write errors must propagate")
        } catch UIElementError.axError(let error) {
            precondition(error == .cannotComplete && writes == 1)
        }
        // State decoding is independent of supported/transaction attributes.
        for raw in values {
            var attributes: [UIElementAttribute: AXPartialValue] = [:]
            if let raw { attributes[key] = AXPartialValue(value: AXEncodedValue(value: raw),
                arraySubsetDescriptor: nil, textTruncationDescriptor: nil) }
            let cache = UIElementCache(supportedAttributes: [], attributes: attributes, transactionAttributes: [])
            precondition(uiElementIsDisclosing(cache: cache) == ((raw as? Bool) == true))
        }
        precondition(UIElementAction.expand.name == "SAIExpand")
        precondition(UIElementAction.collapse.name == "SAICollapse")
        precondition(UIElementAction("é") == UIElementAction("e\u{301}"))
        precondition(Set([UIElementAction("é"), UIElementAction("e\u{301}")]).count == 1)
        let original = UIElementAction.expand
        UIElementAction.expand = UIElementAction("custom-action")
        let empty = UIElementCache(supportedAttributes: [key], attributes: [:], transactionAttributes: nil)
        precondition(uiElementDisclosureActions(cache: empty, freshSupportedAttributes: { fatalError("must use cache") }, isAttributeSettable: { _ in true }).first?.name == "custom-action")
        UIElementAction.expand = original
        let element = UIElement(axElement: AXUIElementCreateSystemWide(), cache: empty)
        var trace: [String] = []
        let combined = element.actions(readNativeActions: {
            trace.append("native"); return [UIElementAction("AXPress"), .expand]
        }, freshSupportedAttributes: { fatalError("must use cached support") },
        isAttributeSettable: { _ in trace.append("writable"); return true },
        reportError: { _ in fatalError("successful read") })
        precondition(combined.map(\.name) == ["AXPress", "SAIExpand", "SAIExpand"])
        precondition(trace == ["native", "writable"])
        trace = []
        let failed = element.actions(readNativeActions: {
            trace.append("native"); throw UIElementError.axError(.cannotComplete)
        }, freshSupportedAttributes: { fatalError("must skip supplemental actions") },
        isAttributeSettable: { _ in fatalError("must skip writability") }, reportError: {
            guard case UIElementError.axError(.cannotComplete) = $0 else { fatalError("lost original error") }
            trace.append("error")
        })
        precondition(failed.isEmpty && trace == ["native", "error"])
        let emptyNative = element.actions(readNativeActions: { [] },
            freshSupportedAttributes: { fatalError("must use cached support") },
            isAttributeSettable: { _ in true }, reportError: { _ in fatalError("successful empty read") })
        precondition(emptyNative == [.expand])
        print("native disclosure actions preserve lazy support, writability and Bool selection: \(count) cases")
    }
}
