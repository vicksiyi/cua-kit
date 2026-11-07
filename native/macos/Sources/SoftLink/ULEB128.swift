// Recovered from SoftLink.readULEB128, 0x10024d34c..<0x10024d4a4.
// Caller owns a valid buffer and a nonnegative offset/size. Like the native
// pointer API this function does not manufacture bounds for invalid memory.
public func readULEB128(from bytes: UnsafePointer<UInt8>, size: Int, offset: inout Int) -> UInt64? {
    var value: UInt64 = 0
    for index in 0..<10 {
        guard offset < size else { return nil }
        let byte = bytes[offset]
        offset += 1
        value |= UInt64(byte & 0x7f) << (index * 7)
        if byte & 0x80 == 0 { return value }
    }
    // The tenth continuation byte is consumed, but an eleventh is never read.
    // High payload bits on a terminating tenth byte are truncated, not rejected.
    return nil
}
