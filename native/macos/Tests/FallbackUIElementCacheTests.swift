import Foundation
import ApplicationServices
import os

@main
struct FallbackUIElementCacheTests {
    static func main() {
        let role = UIElementAttribute("AXRole")
        let title = UIElementAttribute("AXTitle")
        let element = AXUIElementCreateApplication(getpid())
        let equivalent = AXUIElementCreateApplication(getpid())
        let other = AXUIElementCreateSystemWide()
        let storage = UIElementFallbackCache(initialState: [:])
        let sameStorage = storage // OSAllocatedUnfairLock copies share the same allocation.
        precondition(fallbackUIElementCache(element: element, in: storage) == nil)
        precondition(storage.withLock { $0.isEmpty })
        let object = "first" as NSString
        let partial = AXPartialValue(value: AXEncodedValue(value: object),
            arraySubsetDescriptor: nil, textTruncationDescriptor: AXTruncationDescriptor(count: 8, availableRange: 0..<2))
        storeFallbackUIElementCache(element: element, supportedAttributes: [role, title], attributes: [role: partial], in: storage)
        let before = fallbackUIElementCache(element: equivalent, in: sameStorage)!
        precondition(before.supportedAttributes == [role, title])
        precondition(before.attributes[title] == nil && before.transactionAttributes == nil)
        precondition(before.attributes[role]!.value.value === object)
        precondition(before.attributes[role]!.textTruncationDescriptor?.availableRange == 0..<2)
        precondition(fallbackUIElementCache(element: other, in: storage) == nil)
        storeFallbackUIElementCache(element: equivalent, supportedAttributes: [], attributes: [:], in: sameStorage)
        let replaced = fallbackUIElementCache(element: element, in: storage)!
        precondition(replaced.attributes.isEmpty && replaced.supportedAttributes.isEmpty)
        precondition(before.attributes.count == 1) // Earlier snapshots retain value semantics.
        precondition(storage.withLock { $0.count } == 1)

        // Concurrent readers/writers exercise the real system lock and CF-keyed
        // dictionary, without AX queries or UI interaction for these references.
        let targets = (0..<48).map { AXUIElementCreateApplication(pid_t(200_000 + $0)) }
        DispatchQueue.concurrentPerform(iterations: targets.count) { index in
            let value = AXPartialValue(value: AXEncodedValue(value: NSNumber(value: index)),
                arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
            for _ in 0..<20 {
                storeFallbackUIElementCache(element: targets[index], supportedAttributes: [role], attributes: [role: value], in: storage)
                let read = fallbackUIElementCache(element: targets[index], in: storage)!
                precondition(read.attributes[role]!.value.value as? Int == index)
            }
        }
        precondition(storage.withLock { $0.count } == targets.count + 1)
        for (index, target) in targets.enumerated() {
            precondition(fallbackUIElementCache(element: target, in: storage)!.attributes[role]!.value.value as? Int == index)
        }
        let independent = UIElementFallbackCache(initialState: [:])
        precondition(fallbackUIElementCache(element: element, in: independent) == nil)
        print("native fallback cache system locking, replacement, snapshots and concurrent keys passed")
    }
}
