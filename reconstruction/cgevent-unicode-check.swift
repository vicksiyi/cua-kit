import CoreGraphics
import SystemSoftware

@main struct Check {
    static func main() {
        let event = CGEventAPI.createKeyboardEvent(source: nil, virtualKey: 0, keyDown: true)!
        for units in [Array<UInt16>(), Array("abc".utf16), Array("A🌍你好".utf16)] {
            for length in Set([0, units.count, min(1, units.count)]) {
                CGEventAPI.keyboardSetUnicodeString(event, stringLength: length, unicodeString: units)
                var actual = -1
                var output = Array(repeating: UInt16(0xffff), count: 32)
                output.withUnsafeMutableBufferPointer {
                    CGEventAPI.keyboardGetUnicodeString(event, maxStringLength: $0.count,
                        actualStringLength: &actual, unicodeString: $0.baseAddress)
                }
                precondition(actual == length && Array(output.prefix(actual)) == Array(units.prefix(length)))
                CGEventAPI.keyboardGetUnicodeString(event, maxStringLength: 0,
                    actualStringLength: nil, unicodeString: nil)
                // Compare truncation semantics with the SDK entry; do not guess
                // whether actualStringLength counts copied or available units.
                var restoredCount = -1, sdkCount = -1
                var restored = Array(repeating: UInt16(0xffff), count: 2)
                var sdk = restored
                restored.withUnsafeMutableBufferPointer {
                    CGEventAPI.keyboardGetUnicodeString(event, maxStringLength: 2,
                        actualStringLength: &restoredCount, unicodeString: $0.baseAddress)
                }
                sdk.withUnsafeMutableBufferPointer {
                    event.keyboardGetUnicodeString(maxStringLength: 2,
                        actualStringLength: &sdkCount, unicodeString: $0.baseAddress)
                }
                precondition(restored == sdk && restoredCount == sdkCount)
            }
        }
        for point in [CGPoint.zero, CGPoint(x: -401.5, y: 90.25)] {
            CGEventAPI.setLocation(event, location: point)
            precondition(CGEventAPI.getUnflippedLocation(event) == event.unflippedLocation)
        }
        print("SystemSoftware Unicode UTF16/explicit length/truncation/nil pointers and unflipped location passed; no event posting")
    }
}
