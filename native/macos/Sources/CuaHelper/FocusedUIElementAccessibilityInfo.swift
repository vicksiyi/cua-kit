import Foundation

// Nominal descriptor 0x1012c1824 / field descriptor 0x10131aa64.
struct FocusedUIElementAccessibilityInfo {
    var windowRevision: UIElementTreeRevision<TransformedUIElement>
    var copyMenuItemIsEnabled: Bool
    var webAreaURL: URL?
    var contextType: UIElementContextType
    var screenshotNeededForContext: Bool
}

// This stage consumes transformed trees. Inner extract initializes Copy=false
// at 0x10023ad9c; URL and screenshot metadata were captured before transform.
// Root/appending revision rendering uses the same live context as transforms.
func makeSelectionAccessibilityInfo(trees: SelectionExtractionTrees,
    previousRevision: UIElementTreeRevision<TransformedUIElement>?,
    isAXTreeDiffingEnabled: Bool, context: inout UIElementTransformationContext
) throws -> FocusedUIElementAccessibilityInfo {
    let revision = try makeSelectionTreeRevision(tree: trees.tree, focusTree: trees.focusTree,
        previousRevision: previousRevision, isAXTreeDiffingEnabled: isAXTreeDiffingEnabled,
        context: &context)
    return .init(windowRevision: revision, copyMenuItemIsEnabled: false,
        webAreaURL: trees.webAreaURL, contextType: context.type,
        screenshotNeededForContext: trees.screenshotNeededForContext)
}
