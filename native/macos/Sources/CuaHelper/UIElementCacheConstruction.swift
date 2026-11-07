import ApplicationServices
import AppKit
import os

// Source transaction Cache fields; construction/prefetch of this snapshot and
// TaskLocal ownership are separate from the element-cache constructor below.
struct UIElementTransactionCache {
    let attributeTable: [AXUIElement: [UIElementAttribute: AXPartialValue]]
    let requestedAttributes: Set<UIElementAttribute>
    let fallbackElements: UIElementFallbackCache
}

// Control flow of 0x10076589c, using explicit source-boundary dependencies.
// This accepts both system and provider reads without inventing a provider.
func constructUIElementCache(
    element: AXUIElement,
    transaction: UIElementTransactionCache?,
    readSupported: () -> [UIElementAttribute],
    bundleIdentifier: () -> String?,
    readValues: ([UIElementAttribute]) throws -> [UIElementAttribute: AXPartialValue]
) -> UIElementCache {
    if let transaction {
        if let hit = prefetchedUIElementCache(element: element,
            attributeTable: transaction.attributeTable,
            requestedAttributes: transaction.requestedAttributes) { return hit }
        if let hit = fallbackUIElementCache(element: element, in: transaction.fallbackElements) { return hit }
    }
    let supported = Set(readSupported())
    let requested = coldCacheAttributes(supported: supported, bundleIdentifier: bundleIdentifier)
    let values: [UIElementAttribute: AXPartialValue]
    if requested.isEmpty {
        values = [:]
    } else {
        do {
            values = try readValues(Array(requested))
        } catch {
            // Source 0x1007660a0..0x1007660e4: return supported names and empty
            // data, bypassing fallback insertion so a later access may retry.
            return UIElementCache(supportedAttributes: supported, attributes: [:], transactionAttributes: nil)
        }
    }
    if let transaction {
        storeFallbackUIElementCache(element: element, supportedAttributes: supported,
            attributes: values, in: transaction.fallbackElements)
    }
    return UIElementCache(supportedAttributes: supported, attributes: values, transactionAttributes: nil)
}

// Direct system path, without claiming the original MockProvider dispatch or
// TaskLocal transaction acquisition. Caller supplies the transaction snapshot.
func constructSystemUIElementCache(element: AXUIElement, transaction: UIElementTransactionCache?) -> UIElementCache {
    constructUIElementCache(element: element, transaction: transaction,
        readSupported: { decodedAXSupportedAttributes(readRawAXAttributeNames(element)) },
        bundleIdentifier: {
            guard let pid = resolvedAXProcessID(element) else { return nil }
            return NSRunningApplication(processIdentifier: pid)?.bundleIdentifier
        },
        readValues: { try readSystemAXAttributeValues(element, $0) })
}

extension UIElement {
    // Original init(element:) resolves the current transaction once, then builds
    // its cache while retaining the original AX reference (0x10072187c).
    // The scoped overload supplies TaskLocal acquisition; this seam also permits isolated tests.
    init(
        element: AXUIElement,
        readTransaction: () -> UIElementTransactionCache?,
        constructCache: (AXUIElement, UIElementTransactionCache?) -> UIElementCache
    ) {
        let transaction = readTransaction()
        self.init(axElement: element, cache: constructCache(element, transaction))
    }

    // Explicit system path: nil means a deliberate cold construction, not an
    // invented empty cache or a replacement for the original TaskLocal lookup.
    init(systemElement element: AXUIElement, transaction: UIElementTransactionCache?) {
        self.init(element: element, readTransaction: { transaction },
            constructCache: { constructSystemUIElementCache(element: $0, transaction: $1) })
    }
}
