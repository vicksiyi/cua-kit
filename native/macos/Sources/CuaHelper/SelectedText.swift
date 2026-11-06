// Recovered control flow of AccessibilitySupport.UIElementProtocol.selectedText.
// Closures stand in for the original typed AX accessors. Marker wrappers and
// concrete encoding/decoding are restored separately; cache/protocol dispatch
// and production selection-source integration remain incomplete.
func selectedText<MarkerRange>(
    readAttribute: () -> String?,
    readMarkerRange: () -> MarkerRange?,
    readStringForMarkerRange: (MarkerRange) throws -> String?
) -> String? {
    if let value = readAttribute(), !value.isEmpty { return value }
    guard let range = readMarkerRange() else { return nil }
    guard let value = try? readStringForMarkerRange(range), !value.isEmpty else { return nil }
    return value
}
