import ApplicationServices

// System branch of AXUIElement.arrayCount(for:), 0x1006f6774..<0x1006f6918.
// Preserve the out-count even on errors; the element-level caller determines
// which statuses throw. No retries, array decoding or count normalization.
func copiedAXArrayCount(
    copy: (inout CFIndex) -> AXError
) -> (error: AXError, count: Int) {
    var count: CFIndex = 0
    let error = copy(&count)
    return (error, count)
}

func readSystemAXArrayCount(
    _ element: AXUIElement, _ attribute: UIElementAttribute
) -> (error: AXError, count: Int) {
    let targetPID = resolvedAXProcessID(element)
    return onAXAttributeReadThread(targetPID: targetPID) {
        copiedAXArrayCount { AXUIElementGetAttributeValueCount(element, attribute.name, &$0) }
    }
}
