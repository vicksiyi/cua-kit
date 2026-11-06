import Foundation
import ApplicationServices

@main
struct AXDynamicParameterEncodingTests {
    static func expect(_ condition: Bool) { precondition(condition) }
    static func main() throws {
        let raw = AXUIElementCreateSystemWide()
        let key = UIElementAttribute("AXRole")
        let partial = AXPartialValue(value: AXEncodedValue(value: "AXApplication" as NSString),
            arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        let cache = UIElementCache(supportedAttributes: [key], attributes: [key: partial], transactionAttributes: [])
        let element = UIElement(axElement: raw, cache: cache)
        expect(try AXEncodedValue(wrapping: element).value === raw)
        expect(try AXEncodedValue(wrapping: raw).value === raw)
        expect(element.cache.transactionAttributes != nil && element.cache.transactionAttributes!.isEmpty)

        var bytes: [UInt8] = [1, 2, 3, 4]
        let marker = bytes.withUnsafeMutableBufferPointer { AXTextMarkerCreate(nil, $0.baseAddress!, $0.count) }
        let markerWrapper = UITextMarker(marker: marker)
        let rangeWrapper = UITextMarkerRange(start: markerWrapper, end: markerWrapper)
        expect(try AXEncodedValue(wrapping: markerWrapper).value === marker)
        expect(try AXEncodedValue(wrapping: rangeWrapper).value === rangeWrapper.range)

        let samples: [(Any, AXValueType)] = [(CFRange(location: 2, length: 7), .cfRange),
            (CGPoint(x: 1.5, y: -4), .cgPoint), (CGRect(x: 3, y: 5, width: 7, height: 9), .cgRect),
            (CGSize(width: 4.5, height: 8), .cgSize)]
        for (value, kind) in samples {
            let encoded = try AXEncodedValue(wrapping: value).value
            expect(CFGetTypeID(encoded) == AXValueGetTypeID())
            let ax = unsafeBitCast(encoded, to: AXValue.self)
            expect(AXValueGetType(ax) == kind)
            switch kind {
            case .cfRange:
                var v = CFRange(); expect(AXValueGetValue(ax, kind, &v) && v.location == 2 && v.length == 7)
            case .cgPoint:
                var v = CGPoint.zero; expect(AXValueGetValue(ax, kind, &v) && v == value as! CGPoint)
            case .cgRect:
                var v = CGRect.zero; expect(AXValueGetValue(ax, kind, &v) && v == value as! CGRect)
            case .cgSize:
                var v = CGSize.zero; expect(AXValueGetValue(ax, kind, &v) && v == value as! CGSize)
            default: preconditionFailure("Unexpected AX type")
            }
        }
        let text = try AXEncodedValue(wrapping: "hello")
        expect(text.valueIsString && text.value as? String == "hello")
        expect(try AXEncodedValue(wrapping: 42).value as? Int == 42)
        let object = NSObject()
        expect(try AXEncodedValue(wrapping: object).value === object)
        // Generic boxing must not recursively encode geometries inside arrays.
        let array = try AXEncodedValue(wrapping: [CGPoint(x: 1, y: 2)]).value
        expect(array is NSArray)
        let item = (array as! NSArray)[0] as AnyObject
        expect(CFGetTypeID(item) != AXValueGetTypeID())
        print("native dynamic AX encoding preserves branch types, references and nonrecursive bridging")
    }
}
