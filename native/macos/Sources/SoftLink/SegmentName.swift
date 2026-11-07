import MachO

public let linkeditSegmentName = Array("__LINKEDIT".utf8)

// 0x10024b8e8 forwards the fixed 16-byte field to 0x10024c1f4.
// Short matches require one following NUL, not an entirely zero-filled tail.
public func segmentName(_ segment: segment_command_64, matches expected: [UInt8]) -> Bool {
    var name = segment.segname
    return withUnsafeBytes(of: &name) { bytes in
        guard expected.count <= bytes.count else { return false }
        for index in expected.indices {
            guard bytes[index] == expected[index] else { return false }
        }
        return expected.count == bytes.count || bytes[expected.count] == 0
    }
}
