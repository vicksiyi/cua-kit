import Foundation

// Local name for tags returned by 0x10075bbf0..<0x10075bffc. Labels are the
// constructor's small-string tables at 0x1011955f8 and 0x101195628.
enum TransformedUIElementValueType: Int {
    case float, integer, boolean, string, date, unknown

    var name: String {
        switch self {
        case .float: return "float"
        case .integer: return "integer"
        case .boolean: return "boolean"
        case .string: return "string"
        case .date: return "date"
        case .unknown: return "unknown"
        }
    }
}

// Only the cached value is inspected: no uncached AXValue request. Repeated
// role/subrole getter calls preserve the source's short-circuit evaluation.
func transformedUIElementValueType(cachedValue: AnyObject?,
    role: () -> UIElementRole, subrole: () -> String?
) -> TransformedUIElementValueType {
    guard let value = cachedValue else {
        return role() == .textField || role() == .textArea ? .string : .unknown
    }
    if role() == .checkBox {
        if subrole() == "AXSwitch" || subrole() == "AXToggle" { return .boolean }
    }
    let type = CFGetTypeID(value)
    if type == CFNumberGetTypeID() {
        let number = unsafeBitCast(value, to: CFNumber.self)
        return CFNumberIsFloatType(number) ? .float : .integer
    }
    if type == CFBooleanGetTypeID() { return .boolean }
    if type == CFStringGetTypeID() { return .string }
    if type == CFDateGetTypeID() { return .date }
    return .unknown
}

extension UIElement {
    // Composition for the transformed constructor; does not change the raw
    // UIElement protocol's valueTypeName default.
    func transformedValueType() -> TransformedUIElementValueType {
        transformedUIElementValueType(
            cachedValue: cache.attributes[UIElementAttribute("AXValue")]?.value.value,
            role: { role }, subrole: { subrole })
    }
}
