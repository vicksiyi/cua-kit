import CoreGraphics

// Operation body 0x10074eda0..0x10074f060, executed by the enclosing
// compensation task. Construct/post taken first, then construct/post returned.
// If the second construction fails, the first notification has already sent.
// This helper does not decide process classification or task error policy.
func refreshViewBridgeKeyFocus(for pid: Int32,
    makeTaken: () throws -> CGEvent = { try SynthesizedEvent.notifyWindowKeyFocusRemoved().cgEvents[0] },
    makeReturned: () throws -> CGEvent = { try SynthesizedEvent.notifyWindowKeyFocusReturned().cgEvents[0] },
    send: (CGEvent, Int32) -> Void = { dispatchNativeEvent($0, to: $1) }
) throws {
    send(try makeTaken(), pid)
    send(try makeReturned(), pid)
}

// Caller 0x10074ea58..0x10074eac4 creates one unstructured throwing task
// through 0x1006ffa48 and releases its handle without awaiting it. The two
// swift_task_create sites in that helper are mutually exclusive branches.
// Preserve errors in the task result; do not silently retry the operation.
@discardableResult
func scheduleViewBridgeKeyFocusRefresh(for pid: Int32,
    operation: @escaping @Sendable (Int32) throws -> Void = { try refreshViewBridgeKeyFocus(for: $0) }
) -> Task<Void, Error> {
    Task { try operation(pid) }
}
