import CoreFoundation

func resolveSelectionExtractionFocus(focused: UIElement?, app: ApplicationUIElement,
    window: WindowUIElement, reportError: (Error) -> Void) -> UIElement? {
    resolveSelectionExtractionFocus(focused: focused, app: app, window: window,
        hasSelectedText: { element in
            extractionWebAreaHasSelection(selectedRange: { element.selectedTextRange },
                hasSelectedMarkerRange: { element.selectedTextMarkerRange != nil })
        }, reportError: reportError)
}

// Native predicate0x10023bfbc: positive selected range length short-circuits;
// absent/zero/negative range falls through to presence of a marker range.
func extractionWebAreaHasSelection(selectedRange: () -> CFRange?,
    hasSelectedMarkerRange: () -> Bool) -> Bool {
    if let range = selectedRange(), range.length > 0 { return true }
    return hasSelectedMarkerRange()
}

// Native work0x10023ae08..0x10023aeb0. Preserve existing focus, otherwise
// only Electron may search for a selected WebArea in the context window.
func resolveSelectionExtractionFocus<Element>(focused: Element?, isElectron: () -> Bool,
    findSelectedWebArea: () -> Element?) -> Element? {
    if let focused { return focused }
    guard isElectron() else { return nil }
    return findSelectedWebArea()
}

func resolveSelectionExtractionFocus(focused: UIElement?, app: ApplicationUIElement,
    window: WindowUIElement, hasSelectedText: (UIElement) -> Bool,
    reportError: (Error) -> Void) -> UIElement? {
    resolveSelectionExtractionFocus(focused: focused, isElectron: { app.isElectronApp },
        findSelectedWebArea: {
            UIElement(axElement: window.axElement, cache: window.cache).descendant(withRole: .webArea,
                passingTest: hasSelectedText, reportError: reportError)
        })
}
