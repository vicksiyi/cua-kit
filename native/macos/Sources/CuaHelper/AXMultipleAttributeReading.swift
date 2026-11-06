import Foundation
import ApplicationServices

// System branch at 0x1006fa640: unlike the single-value raw reader, non-success
// status discards even a present output array. Success/nil remains nil.
func rawAXMultipleAttributeResult(copy: (inout CFArray?) -> AXError) -> (error: AXError, values: [AnyObject]?) {
    var output: CFArray?
    let error = copy(&output)
    guard error == .success, let output else { return (error, nil) }
    return (error, output as! [AnyObject])
}

func readRawAXMultipleAttributes(_ element: AXUIElement, _ attributes: [UIElementAttribute]) -> (error: AXError, values: [AnyObject]?) {
    let names = attributes.map(\.name) as CFArray
    return onAXAttributeReadThread(targetPID: resolvedAXProcessID(element)) {
        rawAXMultipleAttributeResult {
            AXUIElementCopyMultipleAttributeValues(element, names, AXCopyMultipleAttributeOptions(rawValue: 0), &$0)
        }
    }
}

// Source indexes values once for each requested attribute (not zip). A shorter
// system array violates the source bounds invariant; extra results are unused.
func partialAXAttributeValues(_ attributes: [UIElementAttribute], values: [AnyObject]) -> [UIElementAttribute: AXPartialValue] {
    precondition(values.count >= attributes.count, "AX batch values are shorter than requested attributes")
    var result: [UIElementAttribute: AXPartialValue] = [:]
    result.reserveCapacity(attributes.count)
    for (index, attribute) in attributes.enumerated() {
        let value = values[index]
        if !(value is NSNull), CFGetTypeID(value) == AXValueGetTypeID() {
            let axValue = unsafeBitCast(value, to: AXValue.self)
            if AXValueGetType(axValue) == .axError {
                var error = AXError.success
                _ = AXValueGetValue(axValue, .axError, &error)
                if error != .success && error != .noValue && error != .attributeUnsupported {
                    result.removeValue(forKey: attribute)
                    continue
                }
            }
        }
        result[attribute] = AXPartialValue(value: AXEncodedValue(value: value),
            arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    }
    return result
}

// Non-MockProvider branch of the throwing batch reader at 0x1006f77bc.
func checkedAXMultipleAttributeValues(
    _ attributes: [UIElementAttribute],
    result: (error: AXError, values: [AnyObject]?)
) throws -> [UIElementAttribute: AXPartialValue] {
    guard result.error == .success || result.error == .noValue || result.error == .attributeUnsupported else {
        throw UIElementError.axError(result.error)
    }
    guard let values = result.values else { throw UIElementError.failedToWrapAXValue }
    return partialAXAttributeValues(attributes, values: values)
}

func readSystemAXAttributeValues(_ element: AXUIElement, _ attributes: [UIElementAttribute]) throws -> [UIElementAttribute: AXPartialValue] {
    try checkedAXMultipleAttributeValues(attributes, result: readRawAXMultipleAttributes(element, attributes))
}
