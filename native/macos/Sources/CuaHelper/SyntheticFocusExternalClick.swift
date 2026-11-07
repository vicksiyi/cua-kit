import CoreGraphics

// 0x10074a67c: an external click routed elsewhere can still refer to one of
// the synthetically active app's windows. Activate that app normally so the
// user's click receives real focus. The original event always passes through.
func observeSyntheticFocusExternalClick(
    _ event: CGEvent, helperPID: Int32, targetPID: Int32,
    eventWindowID: () -> UInt32?,
    windowOwnerPID: (UInt32) -> Int32?,
    activateApplication: (Int32) -> Void
) -> CGEvent {
    let sourcePID = Int32(event.getIntegerValueField(.eventSourceUnixProcessID))
    guard sourcePID != helperPID else { return event }
    let destinationPID = Int32(event.getIntegerValueField(.eventTargetUnixProcessID))
    guard destinationPID != targetPID else { return event }
    guard let id = eventWindowID(), let owner = windowOwnerPID(id), owner == targetPID else { return event }
    activateApplication(owner)
    return event
}


// Optional CGEventField initializer 0x100731140 pins field 51. The native
// callback uses a checked UInt32 conversion, including zero as a valid value.
func syntheticFocusClickWindowID(_ event: CGEvent) -> UInt32? {
    UInt32(event.getIntegerValueField(CGEventField(rawValue: 51)!))
}
