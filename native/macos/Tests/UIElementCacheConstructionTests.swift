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
        var initEvents: [String] = []
        let initialized = UIElement(element: element, readTransaction: {
            initEvents.append("transaction"); return transaction
        }, constructCache: { received, snapshot in
            initEvents.append("cache")
            precondition(received === element && snapshot?.requestedAttributes == [other])
            return UIElementCache(supportedAttributes: [role], attributes: [role: value], transactionAttributes: [other])
        })
        precondition(initialized.axElement === element && initEvents == ["transaction", "cache"])
        precondition(initialized.cache.attributes[role]?.value.value === raw)
        let initializerTransaction = UIElementTransactionCache(attributeTable: [element: [role: value]],
            requestedAttributes: [role, other], fallbackElements: UIElementFallbackCache(initialState: [:]))
        let systemInitialized = UIElement(systemElement: element, transaction: initializerTransaction)
        precondition(systemInitialized.axElement === element)
        precondition(systemInitialized.cache.attributes[role]?.value.value === raw)
        precondition(systemInitialized.cache.transactionAttributes == [role, other])
        // The prefetched initializer used an invalid PID without touching system
        // attributes: the transaction's cached value must still survive intact.
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
