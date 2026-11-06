import Foundation

@main
struct UIElementAttributeTests {
    static func main() {
        let first = CFStringCreateWithCString(nil, "AXRole", CFStringBuiltInEncodings.UTF8.rawValue)!
        let second = CFStringCreateWithCString(nil, "AXRole", CFStringBuiltInEncodings.UTF8.rawValue)!
        let wrapped = UIElementAttribute(first)
        precondition(wrapped.name === first)
        precondition(wrapped == UIElementAttribute(second))
        precondition(wrapped == UIElementAttribute("AXRole"))
        precondition(wrapped != UIElementAttribute("axrole"))
        let names = ["", "AX名称", "é", "e\u{301}", "AXRole"]
        for name in names {
            let raw = name as CFString
            let attribute = UIElementAttribute(raw)
            var expected = Hasher()
            var actual = expected
            raw.hash(into: &expected)
            attribute.hash(into: &actual)
            precondition(expected.finalize() == actual.finalize())
            for other in names {
                precondition((attribute == UIElementAttribute(other)) == (raw == other as CFString))
            }
        }
        let decoded = decodedAXSupportedAttributes(["AXRole", "AXTitle", "AXRole", ""] as CFArray)
        precondition(decoded.map { $0.name as String } == ["AXRole", "AXTitle", "AXRole", ""])
        precondition(Set(decoded).count == 3)
        precondition(Set(decoded).contains(UIElementAttribute(second)))
        var values = [wrapped: 1]
        values[UIElementAttribute(second)] = 2
        precondition(values.count == 1 && values[wrapped] == 2)
        precondition(decodedAXSupportedAttributes(nil).isEmpty)
        print("native attribute CF identity, equality, hashing, ordered wrapping and set keys passed")
    }
}
