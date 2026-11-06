// Recovered control flow of AccessibilitySupport.UIElementProtocol.selectedText.
// Closures stand in for the original typed AX accessors, whose element/marker
// wrappers are not yet restored. Keep this logic in Swift, not in the JS client.
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
