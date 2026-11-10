struct SelectionTreeCapturePreparation {
    let treeCache: TransformedUIElement.TreeCache?
    let transaction: UIElementTreeTransaction
    let invalidationMonitor: UIElementTreeInvalidationMonitor?
    let isWebShaped: Bool
}

// Native extract0x100238440..0x1002387ac: validate first cached root, choose
// monitor, read web classification, then reuse or create the full transaction.
// Root selection, enablement and later transformation/revision are separate.
func prepareSelectionTreeCapture(root: any UIElementProtocol, app: ApplicationUIElement,
    contextType: UIElementContextType, treeCache: TransformedUIElement.TreeCache?,
    isWebShaped: (() -> Bool)? = nil,
    makeMonitor: ((ApplicationUIElement) -> UIElementTreeInvalidationMonitor)? = nil,
    makeTransaction: ((any UIElementProtocol, Int) -> UIElementTreeTransaction)? = nil
) -> SelectionTreeCapturePreparation {
    var usableCache = treeCache
    if let cache = usableCache {
        let cachedRoot = cache.tree.items.first?.element.axElement
        let currentRoot = root.axElement
        if cachedRoot == nil || !providerAXElementsEqual(cachedRoot!, currentRoot) { usableCache = nil }
    }
    let monitor: UIElementTreeInvalidationMonitor?
    if contextType == .fullUIContext {
        monitor = usableCache?.invalidationMonitor ?? (makeMonitor?(app) ?? UIElementTreeInvalidationMonitor(app: app))
    } else { monitor = nil }
    let webShaped = isWebShaped?() ?? app.isWebShaped
    let transaction: UIElementTreeTransaction
    if let cache = usableCache { transaction = cache.transaction }
    else {
        let limit = skyshotAXMaxChildCount(contextType: contextType, isWebShaped: webShaped)
        transaction = makeTransaction?(root, limit) ?? root.subtreeTransaction(additionalAttributes: [], maxChildCount: limit)
    }
    return SelectionTreeCapturePreparation(treeCache: usableCache, transaction: transaction,
        invalidationMonitor: monitor, isWebShaped: webShaped)
}
