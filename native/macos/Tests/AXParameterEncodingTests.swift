import Foundation
import ApplicationServices

@main
struct AXParameterEncodingTests {
    static func check<Value: Equatable>(_ original: Value, _ encoded: AXValue, type: AXValueType, initial: Value) {
        precondition(AXValueGetType(encoded) == type)
        var output = initial
        precondition(AXValueGetValue(encoded, type, &output))
        precondition(output == original)
    }
    static func main() throws {
        let range = CFRange(location: -1, length: 0)
        let rangeValue = try encodedAXParameter(range)
        var decodedRange = CFRange(location: 0, length: 0)
        precondition(AXValueGetType(rangeValue) == .cfRange)
        precondition(AXValueGetValue(rangeValue, .cfRange, &decodedRange))
        precondition(decodedRange.location == -1 && decodedRange.length == 0)
        // Encoding preserves values; validation is a separate caller concern.
        let point = CGPoint(x: -2.5, y: 0.25)
        try check(point, encodedAXParameter(point), type: .cgPoint, initial: .zero)
        let size = CGSize(width: -3, height: 4.5)
        try check(size, encodedAXParameter(size), type: .cgSize, initial: .zero)
        let rect = CGRect(x: -1, y: 2, width: 3.75, height: 4)
        try check(rect, encodedAXParameter(rect), type: .cgRect, initial: .zero)
        let bytes: [UInt8] = [1, 0, 255]
        let marker = bytes.withUnsafeBufferPointer { AXTextMarkerCreate(nil, $0.baseAddress!, $0.count) }
        let wrapped = UITextMarker(marker: marker)
        precondition(encodedAXParameter(wrapped) === marker)
        let wrappedRange = UITextMarkerRange(start: wrapped, end: wrapped)
        precondition(encodedAXParameter(wrappedRange) === wrappedRange.range)
        var count = 0
        do {
            _ = try createAXParameterValue(rect, type: .cgRect) { kind, pointer in
                count += 1
                precondition(kind == .cgRect)
                precondition(pointer.load(as: CGRect.self) == rect)
                return nil
            }
            preconditionFailure("Missing AXValueCreate failure")
        } catch UIElementError.failedToWrapAXValue { precondition(count == 1) }
        print("native AX parameter geometry, range and marker encoding passed")
    }
}
