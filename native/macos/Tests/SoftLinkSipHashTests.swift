@main struct SoftLinkSipHashTests {
    static func digest(_ bytes: [UInt8]) -> UInt64 {
        var state = SipHashState()
        bytes.withUnsafeBufferPointer { state.append($0) }
        return state.finalize()
    }
    static func main() {
        // Fixed-key SipHash-2-4 known-answer vectors, messages 00..(length-1).
        let vectors: [UInt64] = [0x726fdb47dd0e0e31,0x74f839c593dc67fd,
            0x0d6c8009d9a94f5a,0x85676696d7fb7e2d,0xcf2794e0277187b7,
            0x18765564cd99a68d,0xcbc9466e58fee3ce,0xab0200f58b01d137,
            0x93f5f5799a932462,0x9e0082df0ba9e4b0,0x7a5dbbc594ddb9f3,
            0xf4b32f46226bada7,0x751e8fbc860ee5fb,0x14ea5627c0843d90,
            0xf723ca908e7af2ee,0xa129ca6149be45e5]
        for (length, expected) in vectors.enumerated() {
            precondition(digest((0..<length).map(UInt8.init)) == expected)
        }
        for length in [0,1,7,8,9,15,16,17,63,64,255,256,257,513] {
            let bytes = (0..<length).map { UInt8(truncatingIfNeeded: $0 * 73 + 11) }
            let expected = digest(bytes)
            for split in 0...length {
                var state = SipHashState()
                Array(bytes[..<split]).withUnsafeBufferPointer { state.append($0) }
                state.append(UnsafeBufferPointer(start: nil, count: 0))
                Array(bytes[split...]).withUnsafeBufferPointer { state.append($0) }
                precondition(state.count == length && state.pendingCount == length % 8)
                let pending = state.pending
                precondition(state.finalize() == expected)
                precondition(state.pending == pending && state.count == length)
            }
            var bytewise = SipHashState()
            for byte in bytes { [byte].withUnsafeBufferPointer { bytewise.append($0) } }
            precondition(bytewise.finalize() == expected)
        }
        print("SoftLink fixed-state SipHash vectors and streaming passed")
    }
}
