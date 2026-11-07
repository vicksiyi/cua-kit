@main struct SoftLinkULEB128Tests {
    static func check(_ bytes: [UInt8], offset start: Int = 0, size: Int? = nil, expected: UInt64?, end: Int) {
        // Keep a valid pointer for empty logical input too.
        (bytes.isEmpty ? [0] : bytes).withUnsafeBufferPointer { buffer in
            var offset = start
            let result = readULEB128(from: buffer.baseAddress!, size: size ?? bytes.count, offset: &offset)
            precondition(result == expected && offset == end)
        }
    }
    static func main() {
        check([], expected: nil, end: 0)
        check([0], offset: 5, size: 1, expected: nil, end: 5)
        check([0xe5, 0x8e, 0x26], expected: 624485, end: 3)
        check([0xff, 0xe5, 0x8e, 0x26, 0xff], offset: 1, size: 4, expected: 624485, end: 4)
        for first in UInt8.min...UInt8.max {
            for second in UInt8.min...UInt8.max {
                let expected: UInt64? = first < 128 ? UInt64(first)
                    : second < 128 ? UInt64(first & 127) | UInt64(second) << 7 : nil
                check([first, second], expected: expected, end: first < 128 ? 1 : 2)
            }
        }
        for length in 1...9 { check(Array(repeating: 0x80, count: length), expected: nil, end: length) }
        for tenth in UInt8.min...UInt8.max {
            check(Array(repeating: 0xff, count: 9) + [tenth, 0],
                expected: tenth < 128 ? (UInt64.max >> 1) | UInt64(tenth & 1) << 63 : nil, end: 10)
        }
        check([0x80, 0], expected: 0, end: 2) // Native accepts non-canonical encodings.
        print("SoftLink ULEB128 values, truncation and consumed offsets passed")
    }
}
