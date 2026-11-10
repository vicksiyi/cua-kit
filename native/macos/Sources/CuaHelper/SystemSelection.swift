import Foundation

// Nominal descriptor0x1012c17a8 / field descriptor0x10131a984: six fields.
// The first three retain shared references; URL/context/screenshot metadata
// must also survive publication (0x10023d244..0x10023d2a8).
struct SystemSelection {
    var applicationWindow: ApplicationWindow
    var windowRevision: UIElementTreeRevision<TransformedUIElement>
    var invalidationMonitor: UIElementTreeInvalidationMonitor?
    var url: URL? = nil
    var contextType: UIElementContextType = .fullUIContext
    var screenshotNeededForContext: Bool = false
}

extension SystemSelection {
    init(applicationWindow: ApplicationWindow,
        accessibilityInfo: FocusedUIElementAccessibilityInfo,
        invalidationMonitor: UIElementTreeInvalidationMonitor?) {
        self.init(applicationWindow: applicationWindow, windowRevision: accessibilityInfo.windowRevision,
            invalidationMonitor: invalidationMonitor, url: accessibilityInfo.webAreaURL,
            contextType: accessibilityInfo.contextType,
            screenshotNeededForContext: accessibilityInfo.screenshotNeededForContext)
    }
}
