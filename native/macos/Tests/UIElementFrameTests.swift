import ApplicationServices
import Foundation

@main
struct UIElementFrameTests {
    static func main() throws {
        let ax = AXUIElementCreateApplication(424242)
        let key = UIElementAttribute.frame
        precondition(key == UIElementAttribute("AXFrame"))
        var rect = CGRect(x: -40, y: 20, width: -300, height: 0)
        let encoded = AXValueCreate(.cgRect, &rect)!
        precondition((try! decodeAXRect(encoded, throwingOnFailure: true)) == rect)
        precondition((try! decodeAXRect(NSValue(rect: rect), throwingOnFailure: true)) == rect)
        for raw: AnyObject in [ax, [] as NSArray, "bad" as NSString, NSNumber(value: 1)] {
            precondition((try! decodeAXRect(raw, throwingOnFailure: false)) == nil)
            do {
                _ = try decodeAXRect(raw, throwingOnFailure: true)
                preconditionFailure("Expected strict error")
            } catch {}
        }
        for var error: AXError in [.noValue, .cannotComplete] {
            let raw = AXValueCreate(.axError, &error)!
            precondition((try! decodeAXRect(raw, throwingOnFailure: false)) == nil)
            do {
                let value = try decodeAXRect(raw, throwingOnFailure: true)
                precondition(error == .noValue && value == nil)
            } catch UIElementError.axError(let actual) { precondition(actual == error && error == .cannotComplete) }
        }
        func partial(_ raw: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: raw), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        let valid = partial(encoded), invalid = partial("bad" as NSString)
        let origin = CGPoint(x: 17, y: -23), size = CGSize(width: 200, height: 99)
        for cached in [nil, valid, invalid] { for fresh in [nil, valid, invalid] {
            for status: AXError in [.success, .noValue, .attributeUnsupported, .cannotComplete] {
                for hasPosition in [false, true] { for hasSize in [false, true] {
                    var events: [String] = []
                    let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [],
                        attributes: cached.map { [key: $0] } ?? [:], transactionAttributes: nil))
                    let result = item.frameValue(read: { events.append("read"); return (status, fresh) },
                        reportError: { _ in events.append("error") },
                        position: { events.append("position"); return hasPosition ? origin : nil },
                        size: { events.append("size"); return hasSize ? size : nil })
                    var expected: [String] = []
                    let cachedValid = cached?.value.value === encoded
                    let freshValid = fresh?.value.value === encoded && status != .cannotComplete
                    if !cachedValid {
                        expected.append("read")
                        if status == .cannotComplete || fresh?.value.value === invalid.value.value { expected.append("error") }
                        if !freshValid {
                            expected.append("position")
                            if hasPosition { expected.append("size") }
                        }
                    }
                    precondition(events == expected)
                    let expectedRect: CGRect? = cachedValid || freshValid ? rect : hasPosition && hasSize ? CGRect(origin: origin, size: size) : nil
                    precondition(result == expectedRect)
                } }
            }
        } }
        let unsupported = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: [key]))
        precondition(unsupported.frameValue(read: { fatalError("unsupported attribute must not read") },
            reportError: { _ in fatalError() }, position: { origin }, size: { size }) == CGRect(origin: origin, size: size))
        print("frame read preserves cache, strict decode, error reporting and position-size fallback")
    }
}
