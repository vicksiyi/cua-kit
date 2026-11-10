import Foundation
import ApplicationServices

extension UIElementTree where Element == TransformedUIElement {
    // Public native entry0x1007664dc opens the protocol source and forwards to
    //0x100768994, which creates a new visited set for each add invocation.
    // Defaults match extractor23b014: empty path, nil parent, true filter23d79c.
    mutating func add(_ source: any UIElementProtocol,
        context: inout UIElementTransformationContext, filter: (Int, UIElement) -> Bool = { _, _ in true },
        currentPath: IndexPath = IndexPath(), parentRole: UIElementRole? = nil,
        reportDepthLimit: () -> Void, reportLimit: (VisibleChildrenLimitReason) -> Void,
        reportError: (Error) -> Void, reportUnknownDateComponents: (UInt) -> Void
    ) {
        var visited: Set<AXUIElement> = []
        addRecursively(source, at: currentPath, traversalParentRole: parentRole,
            context: context, visited: &visited, filter: filter,
            reportDepthLimit: reportDepthLimit, reportLimit: reportLimit,
            reportError: reportError, reportUnknownDateComponents: reportUnknownDateComponents)
    }
}
