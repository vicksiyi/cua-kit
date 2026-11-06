import Foundation

// Ordinary-object branch of AXEncodedValue.unwrappedThrowing, after the outer
// AXUIElement/marker/AXValue/CFArray branches (0x1006e97c8). This is NOT the full
// dispatcher: callers must not use it to replace those specialized branches.
func decodeAXOrdinaryValue<Value>(_ value: AnyObject, throwingOnFailure: Bool, as type: Value.Type) throws -> Value? {
    if let converted = value as? Value { return converted }
    if throwingOnFailure { throw UIElementError.failedToUnwrapAttributeValue(type) }
    return nil
}

// Concrete adapter for the existing observation collector's string/number
// properties. Specialized CF objects are left to their own decoder branches.
func decodedAXScalarAttribute(_ value: AnyObject) -> Any? {
    let kind = CFGetTypeID(value)
    if kind == CFStringGetTypeID() {
        return try? decodeAXOrdinaryValue(value, throwingOnFailure: false, as: String.self)
    }
    if kind == CFNumberGetTypeID() || kind == CFBooleanGetTypeID() {
        return try? decodeAXOrdinaryValue(value, throwingOnFailure: false, as: NSNumber.self)
    }
    return nil
}
