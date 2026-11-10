import ApplicationServices
import Foundation

// Native reference owner0x1002313d0/0x1002322c0: mutable protocol value and
// immutable strong tree reference. Other protocol requirements intentionally
// inherit defaults (pinned witness table0x10147a080).
final class RefetchableUIElement: UIElementProtocol {
    static var role: UIElementRole? = nil

    // Original raw-AX initializer traps; there is no containing-tree lookup.
    init(element: AXUIElement) { fatalError("Unimplemented") }

    var element: any UIElementProtocol
    let containingTree: RefetchableSkyshotAXTree

    init(element: any UIElementProtocol, containingTree: RefetchableSkyshotAXTree) {
        self.element = element
        self.containingTree = containingTree
    }

    var axElement: AXUIElement { element.axElement }
    var cache: UIElementCache { element.cache }

    // Native0x100231604 replaces the underlying protocol value only after
    // successful resolution, taking the returned wrapper's element rather
    // than replacing this owner or its containing tree. Resolver is explicit
    // here until the concrete RefetchableSkyshotAXTree method is restored.
    func refetchIfNeeded(validateElement: Bool, ignoreValueChange: Bool,
        resolve: (RefetchableSkyshotAXTree, any UIElementProtocol, Bool, Bool) throws -> RefetchableUIElement
    ) throws {
        let resolved = try resolve(containingTree, element, validateElement, ignoreValueChange)
        element = resolved.element
    }

    // Host adapter: this helper serializes production operations on MainActor.
    // Enforce that boundary BEFORE writing; do not block/sync-dispatch to main.
    // The protocol is synchronous, so the dynamic actor assertion only bridges
    // this host contract. It is not part of the recovered vendor algorithm.
    func setValue(_ value: Any, forAttribute attribute: UIElementAttribute) throws {
        guard Thread.isMainThread else {
            throw fail("INVALID_STATE", "Native element writes require the helper main actor.")
        }
        try MainActor.assumeIsolated {
            try element.setValue(value, forAttribute: attribute)
            try refetchIfNeeded(validateElement: true, ignoreValueChange: true)
        }
    }

    // Native0x1002316ec delegates writing before refetch(true, true).
    // A post-write refetch error propagates; the write is not rolled back.
    func setValue(_ value: Any, forAttribute attribute: UIElementAttribute,
        resolve: (RefetchableSkyshotAXTree, any UIElementProtocol, Bool, Bool) throws -> RefetchableUIElement
    ) throws {
        try element.setValue(value, forAttribute: attribute)
        try refetchIfNeeded(validateElement: true, ignoreValueChange: true, resolve: resolve)
    }
}
