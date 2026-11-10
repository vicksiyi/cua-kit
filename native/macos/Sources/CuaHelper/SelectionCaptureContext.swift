import AppKit

// Native extract0x10023820c..0x10023842c snapshots window/app and chooses
// root before enablement. A nonnil assertion triggers a fresh focused read,
// even if that read returns nil. The original context is not mutated.
func withSelectionCaptureContext<Result>(context: FocusedUIElementContext,
    contextType: UIElementContextType, rootElement: (any UIElementProtocol)?,
    performAccessibilityEnablement: Bool,
    enable: (ApplicationUIElement, WindowUIElement, UIElementContextType) -> AXEnablementAssertion?,
    readFocus: (ApplicationUIElement) -> UIElement?,
    work: (any UIElementProtocol, UIElement?) throws -> Result
) rethrows -> Result {
    let window = context.window
    let app = context.app
    let root: any UIElementProtocol = rootElement ?? window
    var focus = context.element
    let assertion = performAccessibilityEnablement ? enable(app, window, contextType) : nil
    defer { assertion?.disable() }
    if assertion != nil { focus = readFocus(app) }
    // Holding only through readFocus would release accessibility enablement
    // before transaction/traversal. Source explicitly disables on both exits,
    // even when another owner retains the assertion beyond this scope.
    return try withExtendedLifetime(assertion) { try work(root, focus) }
}

extension ApplicationUIElement {
    @MainActor
    func enableAccessibilityIfNeeded(window: WindowUIElement?, for contextType: UIElementContextType) -> AXEnablementAssertion? {
        enableAccessibilityIfNeeded(window: window, for: contextType,
            tracker: NativeAXEnablementTracker.shared, reportError: reportAttributeReadError,
            reportInitialized: { application in
                NativeLogger.logger(for: Self.self).debug("Initialized pid=\(application.processIdentifier)")
            }, reportRelease: { kind in
                NativeLogger.logger(for: Self.self).debug("Release kind=\(String(describing: kind))")
            })
    }

    // Synchronous native operation with an explicitly owned tracker. The
    // MainActor convenience above supplies the production singleton; other
    // serialized hosts must supply their own long-lived owner, not allocate
    // a new tracker for each extraction/refetch.
    func enableAccessibilityIfNeeded(window: WindowUIElement?, for contextType: UIElementContextType,
        tracker: AXEnablementAssertionTracker<NSRunningApplication>,
        reportError: @escaping (Error) -> Void,
        reportInitialized: (NSRunningApplication) -> Void,
        reportRelease: @escaping (AXEnablementKind) -> Void
    ) -> AXEnablementAssertion? {
        let app = UIElement(axElement: axElement, cache: cache)
        let window = window.map { UIElement(axElement: $0.axElement, cache: $0.cache) }
        return app.enableAccessibilityIfNeeded(window: window, for: contextType,
            tracker: tracker, reportError: reportError,
            reportInitialized: reportInitialized, reportRelease: reportRelease)
    }
}

@MainActor
func withSelectionCaptureContext<Result>(context: FocusedUIElementContext,
    contextType: UIElementContextType, rootElement: (any UIElementProtocol)?,
    performAccessibilityEnablement: Bool,
    work: (any UIElementProtocol, UIElement?) throws -> Result
) rethrows -> Result {
    try withSelectionCaptureContext(context: context, contextType: contextType, rootElement: rootElement,
        performAccessibilityEnablement: performAccessibilityEnablement,
        enable: { $0.enableAccessibilityIfNeeded(window: $1, for: $2) },
        readFocus: { $0.focusedUIElement }, work: work)
}
