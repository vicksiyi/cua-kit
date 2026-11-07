/// Recovered buffer concatenation semantics from 0x100246f3c and 0x1002473e0.
/// The suffix is appended to the message; it does not alter the fixed key.
public func sipHash(buffer: UnsafeBufferPointer<UInt8>,
                    appending suffix: UnsafeBufferPointer<UInt8>) -> UInt64 {
    var state = SipHashState()
    state.append(buffer)
    state.append(suffix)
    return state.finalize()
}

public func sipHash(bytes: UnsafePointer<UInt8>, count: Int,
                    appending suffix: UnsafeBufferPointer<UInt8>) -> UInt64 {
    var state = SipHashState()
    state.append(bytes: bytes, count: count)
    state.append(suffix)
    return state.finalize()
}
