import ApplicationServices

extension AXHierarchyReader {
    // 0x1006f80a8 uses the actual-PID/provider resolver, not public AX pid.
    // The system factory keeps SPI key loading lazy until a copy is requested.
    static var provider: Self {
        .system(resolvePID: { element in
            resolvedAXReadProcessID(readActualPID: { try element.actualPID },
                reportError: { reportAXReadProcessIDError($0, element: element) })
        })
    }
}

extension UIElementProtocol {
    func subtreeTransaction(additionalAttributes: [UIElementAttribute],
                            maxChildCount: Int) -> UIElementTreeTransaction {
        subtreeTransaction(additionalAttributes: additionalAttributes,
            maxChildCount: maxChildCount, reader: .provider)
    }

    // Reader injection is a reconstruction test seam. The concrete root/cache
    // composition is shared with the production entry, not supplied by tests.
    func subtreeTransaction(additionalAttributes: [UIElementAttribute],
        maxChildCount: Int, reader: AXHierarchyReader
    ) -> UIElementTreeTransaction {
        constructUIElementSubtreeTransaction(element: axElement,
            additionalAttributes: additionalAttributes, maxChildCount: maxChildCount,
            supportedAttributes: { cache.supportedAttributes },
            bundleIdentifier: { axElement.bundleIdentifier },
            readHierarchy: { element, arrays, requested, count in
                reader.read(element, arrayAttributes: arrays,
                    requestedAttributes: requested, maxChildCount: count)
            }, makeElement: { element, transaction in
                // Original calls the cache constructor with this newly created
                // cache, irrespective of an enclosing current transaction.
                UIElement(axElement: element,
                    cache: constructProviderUIElementCache(element: element, transaction: transaction))
            })
    }
}
