import ApplicationServices
import Foundation

@main
struct UIElementSystemChildrenTests {
    static func main() {
        let key = UIElementAttribute(kAXChildrenAttribute)
        let parentAX = AXUIElementCreateApplication(424240)
        let first = AXUIElementCreateApplication(424241), second = AXUIElementCreateApplication(424242)
        func partial(_ object: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: object), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        let childRole = UIElementAttribute(kAXRoleAttribute)
        let transaction = UIElementTransactionCache(attributeTable: [
            first: [childRole: partial("AXButton" as NSString)], second: [:]
        ], requestedAttributes: [childRole], fallbackElements: UIElementFallbackCache(initialState: [:]))
        let children = partial([first, second, first] as NSArray)
        let invalid = partial("bad" as NSString)
        for cached in [nil, partial([] as NSArray), children, invalid] {
            for status: AXError in [.success, .noValue, .attributeUnsupported, .cannotComplete] {
                var reads = 0, errors = 0
                let item = UIElement(axElement: parentAX, cache: UIElementCache(supportedAttributes: [key],
                    attributes: cached.map { [key: $0] } ?? [:], transactionAttributes: nil))
                let result = item.childrenValue(transaction: transaction, read: { reads += 1; return (status, children) },
                    reportError: { _ in errors += 1 })
                let cachedArray = cached.map { CFGetTypeID($0.value.value) == CFArrayGetTypeID() } ?? false
                if cachedArray {
                    precondition(reads == 0 && errors == 0)
                    precondition(result.count == (cached?.value.value === children.value.value ? 3 : 0))
                } else {
                    precondition(reads == 1 && errors == (status == .cannotComplete ? 1 : 0))
                    precondition(result.count == (status == .cannotComplete ? 0 : 3))
                }
                if !result.isEmpty {
                    precondition(result[0].axElement === first && result[1].axElement === second && result[2].axElement === first)
                    precondition(result[0].role == .button && result[1].role == .unknown)
                    precondition(result.allSatisfy { $0.cache.transactionAttributes == [childRole] })
                }
            }
        }
        let unsupported = UIElement(axElement: parentAX, cache: UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: [key]))
        precondition(unsupported.childrenValue(transaction: transaction, read: { fatalError("unsupported children") }, reportError: { _ in fatalError() }).isEmpty)
        let empty = UIElement(axElement: parentAX, cache: UIElementCache(supportedAttributes: [], attributes: [key: partial([] as NSArray)], transactionAttributes: nil))
        // Call the production system adapter: cached empty must not touch the OS.
        precondition(empty.systemChildren(transaction: transaction, reportError: { _ in fatalError() }).isEmpty)
        print("children preserve cached empty, typed child caches and read error semantics")
    }
}
