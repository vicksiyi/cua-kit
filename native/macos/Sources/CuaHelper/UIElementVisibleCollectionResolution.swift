import ApplicationServices

// Source0x1007a5158: try cached AXRows then AXChildren and accept the first
// collection containing every visible identity. Cache descriptors do not gate
// these candidates. Return the original array, preserving order and duplicates.
func resolveVisibleCollection<Identity: Hashable>(visible: [Identity],
    cached: (UIElementAttribute) throws -> [Identity]?,
    fallback: () -> [Identity]?
) -> [Identity]? {
    for attribute in [UIElementAttribute("AXRows"), UIElementAttribute("AXChildren")] {
        if let candidate = try? cached(attribute) {
            let identities = Set(candidate)
            if visible.allSatisfy({ identities.contains($0) }) { return candidate }
        }
    }
    return fallback()
}

extension UIElementProtocol {
    func collectionContainingVisibleElements(_ visible: [UIElement],
        using attribute: UIElementAttribute, reportError: (Error) -> Void
    ) -> [AXUIElement]? {
        resolveVisibleCollection(visible: visible.map { $0.axElement }, cached: { attribute in
            guard let partial = cache.attributes[attribute] else { return nil }
            return try decodeUIElementArray(partial.value.value, throwingOnFailure: false,
                initialize: { $0 })
        }, fallback: {
            uiElementVisibleSubsetFallback(using: attribute, visibleCount: visible.count,
                count: { try count(for: $0) }, read: {
                    completeAXElementCollectionValue(for: $0, reportError: reportError)
                })
        })
    }
}
