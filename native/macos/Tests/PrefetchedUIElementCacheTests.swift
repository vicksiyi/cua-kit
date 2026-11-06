import Foundation
import ApplicationServices

@main
struct PrefetchedUIElementCacheTests {
    static func main() {
        let element = AXUIElementCreateApplication(getpid())
        let equivalent = AXUIElementCreateApplication(getpid())
        let unrelated = AXUIElementCreateSystemWide()
        let role = UIElementAttribute("AXRole")
        let title = UIElementAttribute("AXTitle")
        let requested: Set<UIElementAttribute> = [role, title]
        precondition(prefetchedUIElementCache(element: element, attributeTable: [:], requestedAttributes: requested) == nil)
        let empty = prefetchedUIElementCache(element: element, attributeTable: [element: [:]], requestedAttributes: requested)!
        precondition(empty.supportedAttributes.isEmpty && empty.attributes.isEmpty)
        precondition(empty.transactionAttributes == requested)
        let emptyRequest = prefetchedUIElementCache(element: element, attributeTable: [element: [:]], requestedAttributes: [])!
        precondition(emptyRequest.transactionAttributes != nil && emptyRequest.transactionAttributes!.isEmpty)

        let object = "AXApplication" as NSString
        let partial = AXPartialValue(value: AXEncodedValue(value: object),
            arraySubsetDescriptor: AXArraySubsetDescriptor(count: 10, availableRanges: []),
            textTruncationDescriptor: AXTruncationDescriptor(count: 80, availableRange: 2..<6))
        var table = [element: [role: partial]]
        let cache = prefetchedUIElementCache(element: equivalent, attributeTable: table, requestedAttributes: requested)!
        precondition(cache.supportedAttributes == [role]) // Do not invent support for the requested title.
        precondition(cache.transactionAttributes == requested)
        precondition(cache.attributes[title] == nil)
        precondition(cache.attributes[role]!.value.value === object)
        precondition(cache.attributes[role]!.arraySubsetDescriptor?.availableRanges == [])
        precondition(cache.attributes[role]!.textTruncationDescriptor?.availableRange == 2..<6)
        precondition(prefetchedUIElementCache(element: unrelated, attributeTable: table, requestedAttributes: requested) == nil)
        table[element] = [:]
        precondition(cache.attributes.count == 1 && cache.supportedAttributes == [role])
        // Attributes already present in the transaction are not filtered to the request set.
        let noRequested = prefetchedUIElementCache(element: element, attributeTable: [element: [role: partial]], requestedAttributes: [])!
        precondition(noRequested.attributes.count == 1 && noRequested.supportedAttributes == [role])
        print("native prefetched cache preserves hit and miss, empty values, request sets and partial data")
    }
}
