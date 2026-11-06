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
        precondition(UIElementAction.expand.name == "SAIExpand")
        precondition(UIElementAction.collapse.name == "SAICollapse")
        precondition(UIElementAction("é") == UIElementAction("e\u{301}"))
        precondition(Set([UIElementAction("é"), UIElementAction("e\u{301}")]).count == 1)
        let original = UIElementAction.expand
        UIElementAction.expand = UIElementAction("custom-action")
        let empty = UIElementCache(supportedAttributes: [key], attributes: [:], transactionAttributes: nil)
        precondition(uiElementDisclosureActions(cache: empty, freshSupportedAttributes: { fatalError("must use cache") }, isAttributeSettable: { _ in true }).first?.name == "custom-action")
        UIElementAction.expand = original
        print("native disclosure actions preserve lazy support, writability and Bool selection: \(count) cases")
    }
}
