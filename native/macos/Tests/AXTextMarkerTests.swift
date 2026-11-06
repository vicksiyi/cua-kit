import Foundation
import ApplicationServices

@main
struct AXTextMarkerTests {
    static func marker(_ bytes: [UInt8]) -> AXTextMarker {
        bytes.withUnsafeBufferPointer { AXTextMarkerCreate(nil, $0.baseAddress!, $0.count) }
    }
    static func bytes(_ marker: AXTextMarker) -> [UInt8] {
        Array(UnsafeBufferPointer(start: AXTextMarkerGetBytePtr(marker), count: AXTextMarkerGetLength(marker)))
    }
    static func main() throws {
        // These are opaque fixture bytes, not genuine document positions.
        // Test system CF ownership and range construction without opening apps.
        let startBytes: [UInt8] = [0, 1, 127, 255]
        let endBytes: [UInt8] = [4, 3, 2, 0, 128]
        let start = marker(startBytes), end = marker(endBytes)
        let wrapped = try decodeAXTextMarker(start, throwingOnFailure: true, as: UITextMarker.self)!
        precondition(wrapped.marker === start)
        let range = UITextMarkerRange(start: wrapped, end: UITextMarker(marker: end))
        precondition(CFGetTypeID(range.range) == AXTextMarkerRangeGetTypeID())
        precondition(bytes(AXTextMarkerRangeCopyStartMarker(range.range)) == startBytes)
        precondition(bytes(AXTextMarkerRangeCopyEndMarker(range.range)) == endBytes)
        let decoded = try decodeAXTextMarkerRange(range.range, throwingOnFailure: true, as: UITextMarkerRange.self)!
        precondition(decoded.range === range.range)
        let any = try decodeAXTextMarker(start, throwingOnFailure: true, as: Any.self)
        precondition(any is UITextMarker)
        let optional = try decodeAXTextMarker(start, throwingOnFailure: true, as: Optional<UITextMarker>.self)
        precondition(optional != nil && optional! != nil)
        precondition(decodedAXTextMarkerAttribute(start, as: UITextMarker.self)?.marker === start)
        precondition(decodedAXTextMarkerAttribute(range.range, as: UITextMarkerRange.self)?.range === range.range)
        precondition(decodedAXTextMarkerAttribute(start, as: UITextMarkerRange.self) == nil)
        precondition(decodedAXTextMarkerAttribute(range.range, as: UITextMarker.self) == nil)
        for wrong in ["not marker" as CFString, [1, 2] as CFArray, AXUIElementCreateApplication(getpid())] as [AnyObject] {
            precondition(decodedAXTextMarkerAttribute(wrong, as: UITextMarker.self) == nil)
            precondition(decodedAXTextMarkerAttribute(wrong, as: UITextMarkerRange.self) == nil)
        }
        // The decoder exposes native Swift wrappers, never bare C refs.
        let rawMarker = try decodeAXTextMarker(start, throwingOnFailure: false, as: AXTextMarker.self)
        let rawRange = try decodeAXTextMarkerRange(range.range, throwingOnFailure: false, as: AXTextMarkerRange.self)
        precondition(rawMarker == nil && rawRange == nil)
        for throwing in [false, true] {
            do {
                let value = try decodeAXTextMarker(start, throwingOnFailure: throwing, as: String.self)
                precondition(!throwing && value == nil)
            } catch UIElementError.failedToUnwrapAttributeValue(let type) {
                precondition(throwing && type == String.self)
            } catch { preconditionFailure("Unexpected marker error: \(error)") }
            do {
                let value = try decodeAXTextMarkerRange(range.range, throwingOnFailure: throwing, as: Int.self)
                precondition(!throwing && value == nil)
            } catch UIElementError.failedToUnwrapAttributeValue(let type) {
                precondition(throwing && type == Int.self)
            } catch { preconditionFailure("Unexpected range error: \(error)") }
        }
        print("native text marker wrappers, CF range endpoints and conversion policies passed")
    }
}
