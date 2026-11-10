extension UIElementTree where Element == TransformedUIElement {
    // Extractor 0x10023b174 skips attachment entirely when capture has no
    // focus. Its specialized lookup 0x10023dc7c uses the existing tree table;
    // missing identity clears focus and is reported, without capturing a new
    // standalone element or appending it to the tree.
    mutating func attachSelectionExtractionFocus(_ focus: UIElement?,
        reportMissingFocus: (UIElement) -> Void
    ) {
        guard let focus else { return }
        if setFocusedElement(focus) == nil {
            reportMissingFocus(focus)
        }
    }
}
