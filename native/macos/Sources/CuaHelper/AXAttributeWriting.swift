import ApplicationServices

// 0x1006f7650 and synchronous closure 0x1006f7760: writes accept only success.
// Unlike perform(action:), cannotComplete/attributeUnsupported are not tolerated.
func systemAXAttributeWriteResult(
    _ value: AXEncodedValue,
    for attribute: UIElementAttribute,
    write: (CFString, AnyObject) -> AXError
) throws {
    let status = write(attribute.name, value.value)
    guard status == .success else { throw UIElementError.axError(status) }
}

func setSystemAXAttribute(
    _ element: AXUIElement,
    _ value: AXEncodedValue,
    for attribute: UIElementAttribute
) throws {
    let targetPID = resolvedAXProcessID(element)
    try onAXAttributeReadThread(targetPID: targetPID) {
        try systemAXAttributeWriteResult(value, for: attribute) {
            AXUIElementSetAttributeValue(element, $0, $1)
        }
    }
}
