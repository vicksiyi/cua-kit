import ApplicationServices

// Local name for 0x100763000..<0x100763150. Preserve its mixed units:
// the initial bound comparison uses String.count, but the local conversion
// uses Foundation Range(NSRange, in:), whose offsets are UTF-16.
func transformedUIElementString(in range: NSRange, from text: String,
    readStringForRange: (CFRange) throws -> String?
) -> String {
    let end = range.location + range.length // Source uses checked addition.
    if text.count < end {
        let parameter = CFRange(location: range.location == NSNotFound ? -1 : range.location,
            length: range.length)
        return (try? readStringForRange(parameter)) ?? ""
    }
    guard let indices = Range(range, in: text) else { return "" }
    return String(text[indices])
}

extension UIElement {
    func stringForTransformedValueRange(_ range: NSRange, from text: String) -> String {
        transformedUIElementString(in: range, from: text) { requested in
            let parameter = try AXEncodedValue(wrapping: requested)
            guard let partial = try axElement.parameterizedValue(
                for: UIElementAttribute("AXStringForRange"), parameter: parameter) else { return nil }
            return try decodeAXString(partial.value.value, throwingOnFailure: true)
        }
    }
}
