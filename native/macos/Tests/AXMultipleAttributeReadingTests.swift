import Foundation
import ApplicationServices

@main
struct AXMultipleAttributeReadingTests {
    static func errorValue(_ error: AXError) -> AXValue {
        var error = error
        return AXValueCreate(.axError, &error)!
    }
    static func main() throws {
        let a = UIElementAttribute("AXRole"), b = UIElementAttribute("AXTitle")
        if CommandLine.arguments.contains("--short-output") {
            _ = partialAXAttributeValues([a, b], values: ["short" as NSString])
            fatalError("Short output must not be silently zipped")
        }
        for status in [AXError.success, .noValue, .attributeUnsupported, .cannotComplete, .apiDisabled] {
            for output: CFArray? in [nil, [] as CFArray, ["value"] as CFArray] {
                let result = rawAXMultipleAttributeResult { value in
                    precondition(value == nil); value = output; return status
                }
                precondition(result.error == status)
                if status == .success, let output {
                    precondition(result.values?.count == CFArrayGetCount(output))
                } else { precondition(result.values == nil) }
                do {
                    _ = try checkedAXMultipleAttributeValues([], result: result)
                    precondition(status == .success && output != nil)
                } catch UIElementError.failedToWrapAXValue {
                    precondition([AXError.success, .noValue, .attributeUnsupported].contains(status))
                    precondition(result.values == nil)
                } catch UIElementError.axError(let actual) {
                    precondition(actual == status && ![AXError.success, .noValue, .attributeUnsupported].contains(status))
                }
            }
        }
        let first = "first" as NSString, last = "last" as NSString
        let duplicate = partialAXAttributeValues([a, a], values: [first, last])
        precondition(duplicate[a]!.value.value === last)
        for status in [AXError.success, .noValue, .attributeUnsupported] {
            let value = errorValue(status)
            let result = partialAXAttributeValues([a, a], values: [first, value])
            precondition(result[a]!.value.value === value)
            precondition(result[a]!.arraySubsetDescriptor == nil && result[a]!.textTruncationDescriptor == nil)
        }
        for status in [AXError.cannotComplete, .apiDisabled, .failure] {
            let result = partialAXAttributeValues([a, b, a], values: [first, last, errorValue(status)])
            precondition(result[a] == nil && result[b]!.value.value === last)
        }
        let null = NSNull()
        let result = partialAXAttributeValues([a], values: [null, last])
        precondition(result.count == 1 && result[a]!.value.value === null)
        precondition(partialAXAttributeValues([], values: [last]).isEmpty)
        print("native AX batch statuses, ordered overwrite/removal, errors and null values passed")
    }
}
