func makeExtractedSystemSelection(applicationWindow: ApplicationWindow,
    accessibilityInfo: FocusedUIElementAccessibilityInfo,
    invalidationMonitor: UIElementTreeInvalidationMonitor?, isWebShaped: Bool
) -> SystemSelection {
    var selection = SystemSelection(applicationWindow: applicationWindow,
        accessibilityInfo: accessibilityInfo, invalidationMonitor: invalidationMonitor)
    // Outer 0x10023d2b0 gates URL inspection on the separately captured web
    // classification. Inner screenshot short-circuit uses alwaysIncludeScreenshot.
    if isWebShaped, let url = selection.url, shouldUseFullSkyshot(for: url) {
        selection.screenshotNeededForContext = true
    }
    return selection
}
