import MachO

@main struct SoftLinkByteReadersTests {
    static func check(_ input: [UInt8], start: Int = 0, size: Int? = nil, expected: [UInt8]?, end: Int) {
        (input.isEmpty ? [0] : input).withUnsafeBufferPointer { bytes in
            var offset = start
            precondition(readCStringBytes(from: bytes.baseAddress!, size: size ?? input.count, offset: &offset) == expected)
            precondition(offset == end)
        }
    }
    static func segment(_ bytes: [UInt8]) -> segment_command_64 {
        var result = segment_command_64()
        withUnsafeMutableBytes(of: &result.segname) { field in
            precondition(bytes.count == field.count)
            field.copyBytes(from: bytes)
        }
        return result
    }
    static func main() {
        check([], expected: nil, end: 0)
        check([0], start: 5, expected: nil, end: 5)
        check([0, 7], expected: [], end: 1)
        check([99, 0xff, 0x80, 0, 9], start: 1, expected: [0xff, 0x80], end: 4)
        check([65, 66, 0], size: 2, expected: nil, end: 2)
        for byte in UInt8(1)...UInt8.max {
            check([byte, 0], expected: [byte], end: 2)
            check([byte], expected: nil, end: 1)
        }
        Array([UInt8(0x81), 1, 0xff, 0, 0xac, 2]).withUnsafeBufferPointer { buffer in
            var offset = 0
            precondition(readULEB128(from: buffer.baseAddress!, size: buffer.count, offset: &offset) == 129)
            precondition(readCStringBytes(from: buffer.baseAddress!, size: buffer.count, offset: &offset) == [0xff])
            precondition(readULEB128(from: buffer.baseAddress!, size: buffer.count, offset: &offset) == 300)
            precondition(offset == buffer.count)
        }
        precondition(linkeditSegmentName == [95,95,76,73,78,75,69,68,73,84])
        for length in 0...16 {
            let prefix = Array(repeating: UInt8(0xff), count: length)
            let field = prefix + (length < 16 ? [0] + Array(repeating: UInt8(42), count: 15-length) : [])
            precondition(segmentName(segment(field), matches: prefix))
            precondition(!segmentName(segment(field), matches: prefix + Array(repeating: UInt8(1), count: 17-length)))
            if length > 0 {
                precondition(!segmentName(segment(field), matches: Array(repeating: 0xfe, count: length)))
                precondition(!segmentName(segment(field), matches: Array(prefix.dropLast())))
            }
        }
        precondition(segmentName(segment([65,0,66,0] + Array(repeating: 42, count: 12)), matches: [65,0,66]))
        print("SoftLink raw C strings, composed offsets and Mach-O segment names passed")
    }
}
