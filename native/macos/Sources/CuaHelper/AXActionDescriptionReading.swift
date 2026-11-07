import ApplicationServices
import Foundation

// System branch of AXUIElementRef.description(for:), 0x1006f9904–0x1006f99e0.
// The preceding static optional MockProvider dispatch is not implemented here.
func systemAXActionDescriptionResult(
    copy: (inout CFString?) -> AXError
) throws -> String? {
    var description: CFString?
    let status = copy(&description)
    guard status == .success else { throw UIElementError.axError(status) }
    guard let description else { return nil }
    return description as String
}

func readSystemAXActionDescription(
    _ element: AXUIElement, for action: UIElementAction
) throws -> String? {
    try systemAXActionDescriptionResult {
        AXUIElementCopyActionDescription(element, action.name as CFString, &$0)
    }
}
