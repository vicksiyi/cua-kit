/// Native SoftLink state and fixed initialization constants recovered from
/// 0x100246bbc, 0x100247aa4, 0x100247acc, 0x100247af4 and 0x100247b24.
public struct SipHashState {
    public var v0: UInt64 = 0x7469686173716475
    public var v1: UInt64 = 0x6b617f6d656e6665
    public var v2: UInt64 = 0x6b7f62616d677361
    public var v3: UInt64 = 0x7b6b696e727e6c7b
    public var pending: UInt64 = 0
    public var pendingCount: Int = 0
    public var count: Int = 0

    public init() {}

    private static func rotate(_ value: UInt64, _ bits: Int) -> UInt64 {
        (value << bits) | (value >> (64 - bits))
    }

    /// 0x100247d60: additions wrap; rotations are 13, 32, 16, 21, 17, 32.
    public mutating func sipRound() {
        v0 &+= v1; v1 = Self.rotate(v1, 13) ^ v0; v0 = Self.rotate(v0, 32)
        v2 &+= v3; v3 = Self.rotate(v3, 16) ^ v2
        v0 &+= v3; v3 = Self.rotate(v3, 21) ^ v0
        v2 &+= v1; v1 = Self.rotate(v1, 17) ^ v2; v2 = Self.rotate(v2, 32)
    }

    /// 0x100247d9c: two compression rounds, with message XOR on either side.
    public mutating func compress(_ message: UInt64) {
        v3 ^= message
        sipRound(); sipRound()
        v0 ^= message
    }

    public mutating func append(_ bytes: UnsafeBufferPointer<UInt8>) {
        guard let pointer = bytes.baseAddress else { return }
        append(bytes: pointer, count: bytes.count)
    }

    /// 0x100247878: little-endian words with a partial-word carry across calls.
    /// Requires valid memory, nonnegative length, and an internally valid state.
    public mutating func append(bytes: UnsafePointer<UInt8>, count length: Int) {
        count += length
        var offset = 0
        if pendingCount > 0 {
            while pendingCount < 8 && offset < length {
                pending |= UInt64(bytes[offset]) << (pendingCount * 8)
                pendingCount += 1; offset += 1
            }
            if pendingCount == 8 {
                compress(pending)
                pending = 0; pendingCount = 0
            }
        }
        while offset + 8 <= length {
            compress(UInt64(littleEndian: UnsafeRawPointer(bytes.advanced(by: offset)).loadUnaligned(as: UInt64.self)))
            offset += 8
        }
        while offset < length {
            pending |= UInt64(bytes[offset]) << (pendingCount * 8)
            pendingCount += 1; offset += 1
        }
    }

    /// 0x100246e0c: total length occupies the high byte, then four final rounds.
    /// The native method mutates v0...v3 without resetting pending/count.
    public mutating func finalize() -> UInt64 {
        compress(pending | (UInt64(count) << 56))
        v2 ^= 0xff
        sipRound(); sipRound(); sipRound(); sipRound()
        return v0 ^ v1 ^ v2 ^ v3
    }
}
