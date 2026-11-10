import Foundation
import ApplicationServices

extension UIElementTree where Element == TransformedUIElement {
    // Recursive source0x100769a74: depth/identity guard, current-transaction
    // provider reconstruction, capture, children, filtered recursion, append.
    // The caller owns the shared visited set and original path/filter policy.
    mutating func addRecursively<Source: UIElementProtocol>(_ source: Source, at path: IndexPath,
        traversalParentRole: UIElementRole?, context: UIElementTransformationContext,
        visited: inout Set<AXUIElement>, filter: (Int, UIElement) -> Bool,
        reportDepthLimit: () -> Void, reportLimit: (VisibleChildrenLimitReason) -> Void,
        reportError: (Error) -> Void, reportUnknownDateComponents: (UInt) -> Void
    ) {
        guard beginUIElementTreeVisit(path: path, identity: { source.axElement },
            visited: &visited, reportDepthLimit: reportDepthLimit) else { return }
        let provider = UIElement(element: source.axElement)
        let captured = TransformedUIElement(element: provider, context: context,
            traversalParentRole: traversalParentRole, reportError: reportError,
            reportUnknownDateComponents: reportUnknownDateComponents)
        var subtree = Self(items: [], focusedElement: nil)
        let children = provider.visibleChildrenIfChildrenExceedsThreshold(context: context, reportLimit: reportLimit)
        if let children {
            enumerateFilteredTreeChildren(children.array, path: path, filter: filter) { child, childPath in
                subtree.addRecursively(child, at: childPath, traversalParentRole: captured.role,
                    context: context, visited: &visited, filter: filter,
                    reportDepthLimit: reportDepthLimit, reportLimit: reportLimit,
                    reportError: reportError, reportUnknownDateComponents: reportUnknownDateComponents)
            }
        }
        appendBuiltElement(captured, subtree: subtree, availableSubset: children?.subsetDescriptor)
    }
}
