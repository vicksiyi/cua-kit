import Foundation

struct SelectionExtractionTrees {
    var tree: UIElementTree<TransformedUIElement>
    var focusTree: UIElementTree<TransformedUIElement>?
    var screenshotNeededForContext: Bool
    var webAreaURL: URL?
}

// Inner extractor 0x10023aef0..0x10023b470. Cache validation and focus
// resolution happen before this stage; transformations/revisions happen after.
// In particular, both the fresh and reused branches pass through the menu gate.
func buildSelectionExtractionTrees(root: any UIElementProtocol,
    application: ApplicationUIElement, resolvedFocus: UIElement?,
    cachedTree: UIElementTree<TransformedUIElement>?,
    alwaysIncludeScreenshot: Bool,
    contextType: UIElementContextType, context: inout UIElementTransformationContext,
    reportMissingFocus: (UIElement) -> Void,
    reportSelectionResolutionFailure: () -> Void,
    reportDepthLimit: () -> Void, reportLimit: (VisibleChildrenLimitReason) -> Void,
    reportError: (Error) -> Void, reportUnknownDateComponents: (UInt) -> Void
) -> SelectionExtractionTrees {
    var tree: UIElementTree<TransformedUIElement>
    if let cachedTree {
        tree = cachedTree
    } else {
        tree = .init(items: [], focusedElement: nil)
        tree.add(root, context: &context, reportDepthLimit: reportDepthLimit,
            reportLimit: reportLimit, reportError: reportError,
            reportUnknownDateComponents: reportUnknownDateComponents)
    }
    tree.addSelectionExtractionMenuBar(root: root, application: application,
        context: &context, contextType: contextType, reportError: reportError,
        reportUnknownDateComponents: reportUnknownDateComponents)
    tree.attachSelectionExtractionFocus(resolvedFocus, reportMissingFocus: reportMissingFocus)
    let focusTree = tree.focusTree(context: &context,
        reportSelectionResolutionFailure: reportSelectionResolutionFailure,
        reportDepthLimit: reportDepthLimit, reportLimit: reportLimit,
        reportError: reportError, reportUnknownDateComponents: reportUnknownDateComponents)
    let screenshotNeededForContext = selectionExtractionScreenshotNeededForContext(
        alwaysIncludeScreenshot: alwaysIncludeScreenshot, needsScreenshot: {
            selectionExtractionNeedsScreenshot(tree: tree, application: application, reportError: reportError)
        })
    let webAreaURL = selectionExtractionWebAreaURL(tree: tree)
    return .init(tree: tree, focusTree: focusTree, screenshotNeededForContext: screenshotNeededForContext,
        webAreaURL: webAreaURL)
}
