import CoreGraphics

// 0x100745f8c: session tap 2, head placement, listen-only, leftMouseDown.
// The field/window adapters are explicit until WindowServer geometry bindings
// supply their source-equivalent implementations.
final class SyntheticFocusClickMonitor {
    private let tap: EventTap
    init(helperPID: Int32, targetPID: Int32,
         eventWindowID: @escaping (CGEvent) -> UInt32? = syntheticFocusClickWindowID,
         windowOwnerPID: @escaping (UInt32) -> Int32? = syntheticFocusWindowOwnerPID,
         activateApplication: @escaping (Int32) -> Void = activateSyntheticFocusClickApplication,
         driver: EventTap.Driver = .system) {
        tap = EventTap(location: .session(.cgAnnotatedSessionEventTap),
            placement: .headInsertEventTap, options: .listenOnly,
            eventsOfInterest: CGEventMask(1) << 1, driver: driver)
        tap.startMonitoring { _, event in
            observeSyntheticFocusExternalClick(event, helperPID: helperPID, targetPID: targetPID,
                eventWindowID: { eventWindowID(event) }, windowOwnerPID: windowOwnerPID,
                activateApplication: activateApplication)
        }
    }
    deinit { tap.stopMonitoring() }
}
