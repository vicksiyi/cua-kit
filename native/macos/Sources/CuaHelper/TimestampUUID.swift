import Foundation
import Darwin

// 0x100624738: random bytes, Unix milliseconds in the first six bytes, then
// version 7 and RFC variant bits. Conversion preserves UInt64's native traps.
func timestampUUID(_ timestamp: Date, randomBytes: [UInt8]) -> UUID {
    precondition(randomBytes.count == 16)
    var bytes = randomBytes
    let milliseconds = UInt64(timestamp.timeIntervalSince1970 * 1000)
    for index in 0..<6 {
        bytes[index] = UInt8(truncatingIfNeeded: milliseconds >> ((5 - index) * 8))
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x70
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    return UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5],
        bytes[6], bytes[7], bytes[8], bytes[9], bytes[10], bytes[11],
        bytes[12], bytes[13], bytes[14], bytes[15]))
}

extension UUID {
    init(timestamp: Date) {
        var bytes = [UInt8](repeating: 0, count: 16)
        bytes.withUnsafeMutableBytes { buffer in arc4random_buf(buffer.baseAddress!, buffer.count) }
        self = timestampUUID(timestamp, randomBytes: bytes)
    }
}
