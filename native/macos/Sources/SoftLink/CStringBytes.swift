// Recovered from SoftLink.readCStringBytes, 0x10024d4a4..<0x10024d594.
// The caller supplies valid memory and nonnegative bounds, as for readULEB128.
public func readCStringBytes(from bytes: UnsafePointer<UInt8>, size: Int, offset: inout Int) -> [UInt8]? {
    var result: [UInt8] = []
    while offset < size {
        let byte = bytes[offset]
        offset += 1
        if byte == 0 { return result }
        result.append(byte)
    }
    // Preserve consumed offset even when a terminator was not found.
    return nil
}
