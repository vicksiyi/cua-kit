import ApplicationServices

extension TransformedUIElement {
    // 0x10075d964 compares the captured subrole, without inspecting role.
    var isTableRow: Bool { subrole == "AXTableRow" }

    // 0x10075d9b4 uses exact String equality against the captured DOM classes.
    var isSentByCurrentUser: Bool { domClassList?.contains("is-sender") ?? false }

    var rowIndexRange: ClosedRange<Int>? { cachedIndexRange("AXRowIndexRange") }
    var columnIndexRange: ClosedRange<Int>? { cachedIndexRange("AXColumnIndexRange") }

    // Shared getter 0x10075da8c. Do not fetch missing ranges from the provider.
    private func cachedIndexRange(_ name: String) -> ClosedRange<Int>? {
        guard let range = uiElementCachedValue(UIElementAttribute(name), readCache: { cache }, decode: {
            try? decodeAXRange($0.value.value, throwingOnFailure: false)
        }) else { return nil }
        // The source intentionally excludes singleton ranges (length == 1).
        // Negative locations and overflowing endpoints also return nil.
        guard range.location >= 0, range.length > 1 else { return nil }
        let (end, overflow) = range.location.addingReportingOverflow(range.length - 1)
        guard !overflow else { return nil }
        return range.location...end
    }
}
