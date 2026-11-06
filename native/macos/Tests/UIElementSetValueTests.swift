import ApplicationServices
import Foundation

@main
struct UIElementSetValueTests {
    enum Expected: Error { case encoding, writing }
    static func main() throws {
        let ax = AXUIElementCreateSystemWide()
        let key = UIElementAttribute("AXDisclosing")
        var trace: [String] = []
        do {
            try uiElementSetValue(true, forAttribute: key,
                readAXElement: { fatalError("encoding failure must not resolve AX") },
                encode: { _ in trace.append("encode"); throw Expected.encoding },
                write: { _, _, _ in fatalError("encoding failure must not write") })
            fatalError("encoding failure swallowed")
        } catch Expected.encoding { precondition(trace == ["encode"]) }
        trace = []
        do {
            try uiElementSetValue(true, forAttribute: key, readAXElement: {
                trace.append("element"); return ax
            }, encode: { value in
                trace.append("encode"); return try AXEncodedValue(wrapping: value)
            }, write: { element, encoded, attribute in
                trace.append("write")
                precondition(element === ax && attribute == key)
                precondition(CFGetTypeID(encoded.value) == CFBooleanGetTypeID())
                precondition((encoded.value as? Bool) == true)
                throw Expected.writing
            })
            fatalError("write failure swallowed")
        } catch Expected.writing { precondition(trace == ["encode", "element", "write"]) }
        let point = CGPoint(x: 12, y: 34)
        try uiElementSetValue(point, forAttribute: UIElementAttribute("AXPosition"),
            readAXElement: { ax }, write: { _, encoded, _ in
                precondition(CFGetTypeID(encoded.value) == AXValueGetTypeID())
                let axValue = unsafeBitCast(encoded.value, to: AXValue.self)
                precondition(AXValueGetType(axValue) == .cgPoint)
                var decoded = CGPoint.zero
                precondition(AXValueGetValue(axValue, .cgPoint, &decoded) && decoded == point)
            })
        print("native generic setter encodes before resolution and preserves write failures")
    }
}
