import ApplicationServices
import Algorithms

// System branch of AXUIElementRef.actions, 0x1006f949c..0x1006f9590.
// Unlike supported-attribute enumeration, every non-success AX status throws.
func systemAXActionsResult(copy: (inout CFArray?) -> AXError) throws -> [UIElementAction] {
    var names: CFArray?
    let status = copy(&names)
    guard status == .success else { throw UIElementError.axError(status) }
    guard let names, let strings = names as? [String] else { return [] }
    // The original calls Algorithms.UniquedSequence with a String identity
    // projection. Keep first occurrences and Swift.String equality semantics.
    return strings.uniqued().map(UIElementAction.init)
}

// Explicit system-only provider. Original TaskLocal MockProvider dispatch is
// still separate; this function must not claim to implement that whole getter.
func readSystemAXActions(_ element: AXUIElement) throws -> [UIElementAction] {
    try systemAXActionsResult { AXUIElementCopyActionNames(element, &$0) }
}
