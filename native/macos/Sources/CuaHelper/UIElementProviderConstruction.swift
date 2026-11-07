import ApplicationServices

func constructProviderUIElementCache(element: AXUIElement,
    transaction: UIElementTransactionCache?
) -> UIElementCache {
    constructUIElementCache(element: element, transaction: transaction,
        readSupported: { readAXSupportedAttributes(element) },
        bundleIdentifier: { readAXBundleIdentifier(element) },
        readValues: { try readAXAttributeValues(element, $0) })
}

extension UIElement {
    // Original concrete initializer: current transaction once, then cache
    // construction through the mock-aware attribute/identity front doors.
    init(element: AXUIElement) {
        self.init(element: element, constructCache: constructProviderUIElementCache)
    }
}
