import ApplicationServices

@main
struct UIElementCountTests {
    static func main() throws {
        func partial(_ raw: AnyObject, _ descriptor: AXArraySubsetDescriptor? = nil) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: raw), arraySubsetDescriptor: descriptor,
                textTruncationDescriptor: nil)
        }
        let samples: [(AXPartialValue?, Int)] = [
            (nil, 17), (partial(NSArray()), 0),
            (partial(["bad element", NSNumber(value: 3)] as NSArray), 2),
            (partial("not array" as NSString), 0),
            (partial(NSArray(), AXArraySubsetDescriptor(count: 42, availableRanges: [])), 42),
            (partial("not array" as NSString, AXArraySubsetDescriptor(count: -3)), -3),
        ]
        var cases = 0
        for unsupported in [false, true] {
            for (cached, expected) in samples {
                for status: AXError in [.success, .cannotComplete, .attributeUnsupported, .noValue] {
                    var trace: [String] = []
                    do {
                        let result = try uiElementCount(
                            isKnownUnsupported: { trace.append("support"); return unsupported },
                            cachedValue: { trace.append("cache"); return cached },
                            readArrayCount: { trace.append("read"); return (status, 17) })
                        precondition(unsupported || cached != nil || status == .success)
                        precondition(result == (unsupported ? nil : expected))
                    } catch UIElementError.axError(let error) {
                        precondition(!unsupported && cached == nil && status != .success && error == status)
                    }
                    precondition(trace == (unsupported ? ["support"] : cached == nil
                        ? ["support", "cache", "read"] : ["support", "cache"]))
                    cases += 1
                }
            }
        }
        precondition(cases == 48)
        print("native count preserves support gate, subset totals, raw arrays and strict AX errors: 48 cases")
    }
}
