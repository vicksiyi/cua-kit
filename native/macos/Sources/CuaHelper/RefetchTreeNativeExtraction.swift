import ApplicationServices

extension RefetchableSkyshotAXTree {
    // Native host binding: a fresh context and no TreeCache on every refetch.
    // Default reports are host adapters; explicit reports remain available for
    // callers collecting observation warnings and isolated diagnostics checks.
    @MainActor
    @discardableResult
    func refetchTree() throws -> SystemSelection {
        try refetchTree { try extractNativeSelection() }
    }

    @MainActor
    func extractNativeSelection() throws -> SystemSelection {
        try extractNativeSelection(enable: { $0.enableAccessibilityIfNeeded(window: $1, for: $2) },
            reportMissingFocus: NativeSelectionExtractionDiagnostics.missingFocus,
            reportSelectionResolutionFailure: NativeSelectionExtractionDiagnostics.selectionResolutionFailure,
            reportDepthLimit: NativeSelectionExtractionDiagnostics.depthLimit,
            reportLimit: NativeSelectionExtractionDiagnostics.childLimit,
            reportError: NativeSelectionExtractionDiagnostics.attributeError,
            reportUnknownDateComponents: NativeSelectionExtractionDiagnostics.unknownDateComponents,
            reportUnknownAttributedStyle: NativeSelectionExtractionDiagnostics.unknownAttributedStyle,
            reportUnexpectedNextLine: NativeSelectionExtractionDiagnostics.unexpectedNextLine)
    }

    @MainActor
    @discardableResult
    func refetchTree(reportMissingFocus: (UIElement) -> Void,
        reportSelectionResolutionFailure: () -> Void,
        reportDepthLimit: () -> Void, reportLimit: (VisibleChildrenLimitReason) -> Void,
        reportError: (any Swift.Error) -> Void, reportUnknownDateComponents: (UInt) -> Void,
        reportUnknownAttributedStyle: (String) -> Void,
        reportUnexpectedNextLine: () -> Void
    ) throws -> SystemSelection {
        try refetchTree { try extractNativeSelection(enable: { $0.enableAccessibilityIfNeeded(window: $1, for: $2) },
            reportMissingFocus: reportMissingFocus,
            reportSelectionResolutionFailure: reportSelectionResolutionFailure,
            reportDepthLimit: reportDepthLimit, reportLimit: reportLimit,
            reportError: reportError, reportUnknownDateComponents: reportUnknownDateComponents,
            reportUnknownAttributedStyle: reportUnknownAttributedStyle,
            reportUnexpectedNextLine: reportUnexpectedNextLine) }
    }

    // The extractor is synchronous; only the production tracker binding above
    // requires MainActor. Keep ownership explicit rather than dispatching sync
    // onto the main queue from a protocol setter (which can deadlock).
    @discardableResult
    func extractNativeSelection(
        enable: (ApplicationUIElement, WindowUIElement, UIElementContextType) -> AXEnablementAssertion?,
        reportMissingFocus: (UIElement) -> Void,
        reportSelectionResolutionFailure: () -> Void,
        reportDepthLimit: () -> Void, reportLimit: (VisibleChildrenLimitReason) -> Void,
        reportError: (any Swift.Error) -> Void, reportUnknownDateComponents: (UInt) -> Void,
        reportUnknownAttributedStyle: (String) -> Void,
        reportUnexpectedNextLine: () -> Void
    ) throws -> SystemSelection {
        try extractRefetchSelection(readContext: { try $0.focusedUIElementContext() }, extract: { request in
            try extractSystemSelection(context: request.context, contextType: request.contextType,
                treeCache: request.treeCache, previousRevision: request.previousRevision,
                rootElement: request.rootElement,
                performAccessibilityEnablement: request.performAccessibilityEnablement,
                alwaysIncludeScreenshot: request.alwaysIncludeScreenshot,
                isAXTreeDiffingEnabled: request.isAXTreeDiffingEnabled,
                enable: enable,
                readFocus: { $0.focusedUIElement },
                prepareTransformation: {
                    UIElementTransformationContext(type: request.contextType,
                        application: request.context.app, window: request.context.window,
                        urlConfiguration: nil)
                }, reportMissingFocus: reportMissingFocus,
                reportSelectionResolutionFailure: reportSelectionResolutionFailure,
                reportDepthLimit: reportDepthLimit, reportLimit: reportLimit,
                reportError: reportError, reportUnknownDateComponents: reportUnknownDateComponents,
                reportUnknownAttributedStyle: reportUnknownAttributedStyle,
                reportUnexpectedNextLine: reportUnexpectedNextLine)
        })
    }
}
