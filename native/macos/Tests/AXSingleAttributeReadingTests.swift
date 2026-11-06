import ApplicationServices
import Foundation

@main
struct AXSingleAttributeReadingTests {
    static func main() {
        let values: [AnyObject?] = [nil, "text" as NSString, [] as NSArray, NSNull(), NSNumber(value: 5)]
        for status: AXError in [.success, .noValue, .attributeUnsupported, .cannotComplete, .failure] {
            for value in values {
                let result = partialAXAttributeResult((status, value))
                precondition(result.error == status)
                precondition((result.value == nil) == (value == nil))
                if let partial = result.value {
                    precondition(partial.value.value === value)
                    precondition(partial.arraySubsetDescriptor == nil && partial.textTruncationDescriptor == nil)
                }
            }
        }
        let ax = AXUIElementCreateApplication(424242)
        let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil))
        var rect = CGRect(x: -17, y: 29, width: 320, height: 180)
        let raw = AXValueCreate(.cgRect, &rect)!
        for status: AXError in [.success, .noValue, .attributeUnsupported, .cannotComplete] {
            var events: [String] = []
            let result = item.frameValue(readAttribute: { key in
                if key == .frame { events.append("frame"); return partialAXAttributeResult((status, raw)) }
                precondition(key == .position); events.append("position"); return partialAXAttributeResult((.success, nil))
            }, reportError: { _ in events.append("error") })
            if status == .cannotComplete {
                precondition(result == nil && events == ["frame", "error", "position"])
            } else {
                precondition(result == rect && events == ["frame"])
            }
        }
        print("single attribute system result preserves status, object identity and absent descriptors")
    }
}
