import ApplicationServices
import Foundation

@main
struct UIElementGeometryTests {
    static func partial(_ value: AnyObject) -> AXPartialValue {
        AXPartialValue(value: AXEncodedValue(value: value), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
    }
    static func main() throws {
        let ax = AXUIElementCreateApplication(424242)
        var point = CGPoint(x: -23, y: 17), size = CGSize(width: -200, height: 0)
        let rawPoint = AXValueCreate(.cgPoint, &point)!, rawSize = AXValueCreate(.cgSize, &size)!
        precondition((try! decodeAXPoint(rawPoint, throwingOnFailure: true)) == point)
        precondition((try! decodeAXSize(rawSize, throwingOnFailure: true)) == size)
        precondition((try! decodeAXPoint(NSValue(point: point), throwingOnFailure: true)) == point)
        precondition((try! decodeAXSize(NSValue(size: size), throwingOnFailure: true)) == size)
        // Wrong geometry is a mismatch, never reinterpreted as another two-double struct.
        precondition((try! decodeAXPoint(rawSize, throwingOnFailure: false)) == nil)
        precondition((try! decodeAXSize(rawPoint, throwingOnFailure: false)) == nil)
        let invalid = partial("bad" as NSString)
        for (key, value) in [(UIElementAttribute.position, partial(rawPoint)), (.size, partial(rawSize))] {
            for cached in [nil, invalid, value] { for fresh in [nil, invalid, value] {
                for status: AXError in [.success, .noValue, .attributeUnsupported, .cannotComplete] {
                    var events: [String] = []
                    let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [],
                        attributes: cached.map { [key: $0] } ?? [:], transactionAttributes: nil))
                    let read = { () -> (error: AXError, value: AXPartialValue?) in events.append("read"); return (status, fresh) }
                    let report = { (_: Error) in events.append("error") }
                    let hasValue: Bool
                    if key == .position {
                        let result = item.positionValue(read: read, reportError: report)
                        precondition(result == nil || result == point); hasValue = result != nil
                    } else {
                        let result = item.sizeValue(read: read, reportError: report)
                        precondition(result == nil || result == size); hasValue = result != nil
                    }
                    if cached?.value.value === value.value.value { precondition(hasValue && events.isEmpty) }
                    else {
                        let error = status == .cannotComplete || fresh?.value.value === invalid.value.value
                        precondition(events == (error ? ["read", "error"] : ["read"]))
                        precondition(hasValue == (status != .cannotComplete && fresh?.value.value === value.value.value))
                    }
                }
            } }
            let unsupported = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: [key]))
            let read = { () -> (error: AXError, value: AXPartialValue?) in fatalError("known unsupported") }
            if key == .position { precondition(unsupported.positionValue(read: read, reportError: { _ in fatalError() }) == nil) }
            else { precondition(unsupported.sizeValue(read: read, reportError: { _ in fatalError() }) == nil) }
        }
        for positionPresent in [false, true] { for sizePresent in [false, true] {
            var calls: [UIElementAttribute] = []
            var errors = 0
            let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil))
            let frame = item.frameValue(readAttribute: { key in
                calls.append(key)
                if key == .frame { return (.cannotComplete, nil) }
                if key == .position { return (.success, positionPresent ? partial(rawPoint) : nil) }
                precondition(key == .size); return (.success, sizePresent ? partial(rawSize) : nil)
            }, reportError: { _ in errors += 1 })
            precondition(calls == (positionPresent ? [.frame, .position, .size] : [.frame, .position]))
            precondition(errors == 1)
            precondition(frame == (positionPresent && sizePresent ? CGRect(origin: point, size: size) : nil))
        } }
        // A cached frame short-circuits all provider reads, including position/size.
        var rect = CGRect(origin: point, size: size)
        let cachedFrame = partial(AXValueCreate(.cgRect, &rect)!)
        let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [], attributes: [.frame: cachedFrame], transactionAttributes: nil))
        precondition(item.frameValue(readAttribute: { _ in fatalError("cached frame") }, reportError: { _ in fatalError() }) == rect)
        print("geometry readers preserve typed values, strict errors and complete frame fallback")
    }
}
