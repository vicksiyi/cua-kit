import ApplicationServices
import os

// Original transaction fallbackElements field type. Lock ownership stays with
// the transaction; these helpers do not introduce a process-global cache.
typealias UIElementFallbackCache = OSAllocatedUnfairLock<[AXUIElement: UIElementCache]>

func fallbackUIElementCache(element: AXUIElement, in storage: UIElementFallbackCache) -> UIElementCache? {
    storage.withLock { $0[element] }
}

// The native constructor stores the freshly assembled fallback with a nil
// transactionAttributes field. Reading and writing are separate critical
// sections; this operation replaces an existing entry, without double-checking.
func storeFallbackUIElementCache(
    element: AXUIElement,
    supportedAttributes: Set<UIElementAttribute>,
    attributes: [UIElementAttribute: AXPartialValue],
    in storage: UIElementFallbackCache
) {
    storage.withLock {
        $0[element] = UIElementCache(
            supportedAttributes: supportedAttributes,
            attributes: attributes,
            transactionAttributes: nil
        )
    }
}
