import Foundation
import ApplicationServices
import os

@main
struct UIElementCacheConstructionTests {
    enum ReadError: Error { case unavailable }
    static func main() {
        let element = AXUIElementCreateApplication(424242)
        let role = UIElementAttribute("AXRole"), other = UIElementAttribute("AXUnknown")
        let raw = "AXWindow" as NSString
        let value = AXPartialValue(value: AXEncodedValue(value: raw), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        let fallback = UIElementFallbackCache(initialState: [:])
        let transaction = UIElementTransactionCache(attributeTable: [:], requestedAttributes: [other], fallbackElements: fallback)
        var events: [String] = []
        var shouldFail = true
        func build(_ transaction: UIElementTransactionCache?) -> UIElementCache {
            constructUIElementCache(element: element, transaction: transaction,
                readSupported: { events.append("names"); return [role, role, other] },
                bundleIdentifier: { fatalError("DOM attribute absent") },
                readValues: { attributes in
                    events.append("values"); precondition(Set(attributes) == [role])
                    if shouldFail { throw ReadError.unavailable }
                    return [role: value]
                })
        }
        let failed = build(transaction)
        precondition(failed.supportedAttributes == [role, other] && failed.attributes.isEmpty && failed.transactionAttributes == nil)
        precondition(events == ["names", "values"])
        precondition(fallbackUIElementCache(element: element, in: fallback) == nil)
        shouldFail = false
        let successful = build(transaction)
        precondition(successful.attributes[role]!.value.value === raw && successful.transactionAttributes == nil)
        precondition(events == ["names", "values", "names", "values"])
        _ = build(transaction)
        precondition(events.count == 4) // fallback hit avoids both reads
        let prefetched = UIElementTransactionCache(attributeTable: [element: [:]], requestedAttributes: [other], fallbackElements: fallback)
        let hit = build(prefetched)
        precondition(hit.attributes.isEmpty && hit.supportedAttributes.isEmpty && hit.transactionAttributes == [other])
        precondition(events.count == 4) // empty prefetch takes priority over populated fallback
        _ = build(nil); _ = build(nil)
        precondition(events.count == 8) // no transaction means no hidden/global cache
        let emptyStorage = UIElementFallbackCache(initialState: [:])
        let emptyTransaction = UIElementTransactionCache(attributeTable: [:], requestedAttributes: [], fallbackElements: emptyStorage)
        let empty = constructUIElementCache(element: element, transaction: emptyTransaction,
            readSupported: { [other] }, bundleIdentifier: { fatalError("Unneeded identity") },
            readValues: { _ in fatalError("Empty request must skip batch read") })
        precondition(empty.supportedAttributes == [other] && empty.attributes.isEmpty)
        precondition(fallbackUIElementCache(element: element, in: emptyStorage) != nil)
        let successfulEmptyStorage = UIElementFallbackCache(initialState: [:])
        let successfulEmptyTransaction = UIElementTransactionCache(attributeTable: [:], requestedAttributes: [], fallbackElements: successfulEmptyStorage)
        _ = constructUIElementCache(element: element, transaction: successfulEmptyTransaction,
            readSupported: { [role] }, bundleIdentifier: { fatalError("Unneeded identity") },
            readValues: { names in precondition(names == [role]); return [:] })
        precondition(fallbackUIElementCache(element: element, in: successfulEmptyStorage) != nil)
        let independent = UIElementTransactionCache(attributeTable: [:], requestedAttributes: [], fallbackElements: UIElementFallbackCache(initialState: [:]))
        _ = build(independent)
        precondition(events.count == 10)
        print("native cache construction preserves hit priority, retry after failure, successful empty caching and transaction isolation")
    }
}
