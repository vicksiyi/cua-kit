import CoreGraphics

enum SystemKeyFocusReleaseFailure: Equatable {
    case unavailableIDField
    case status(Int32)
}

// 0x10074f130..0x10074f3bc. The focus ID is event field 71, not a PID
// or window ID. Preserve the source's checked UInt32 conversion and return
// false/report on a missing field or unsuccessful system status.
func releaseSystemKeyFocus(for event: CGEvent,
    idField: CGEventField? = CGEventField(rawValue: 71),
    readID: (CGEvent, CGEventField) -> Int64 = { $0.getIntegerValueField($1) },
    release: (UInt32) -> Int32 = ApplicationRegistrySPI.releaseKeyFocus,
    reportFailure: (SystemKeyFocusReleaseFailure) -> Void
) -> Bool {
    guard let idField else { reportFailure(.unavailableIDField); return false }
    let id = UInt32(readID(event, idField))
    let status = release(id)
    guard status == 0 else { reportFailure(.status(status)); return false }
    return true
}
