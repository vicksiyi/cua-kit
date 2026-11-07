import CoreGraphics

// 0x10074fc14: the callback first snapshots registrations and looks for
// any matching enabled record, then resolves the event's window owner.
func filterMenuDismissalEvent(_ event: CGEvent, targetPID: Int32, menuPID: Int32?,
    suppressionEnabled: () -> Bool, eventWindowID: () -> UInt32?,
    windowOwnerPID: (UInt32) -> Int32?) -> CGEvent? {
    guard suppressionEnabled(), let id = eventWindowID(), let owner = windowOwnerPID(id) else { return event }
    return owner == targetPID || owner == menuPID ? event : nil
}

// Constructor 0x10074b4c8 creates the target tap first and an additional
// menu-process tap whenever menuPID is present (even when the PIDs match).
func menuDismissalEventTaps(targetPID: Int32, menuPID: Int32?,
    driver: EventTap.Driver = .system, handler: @escaping EventTap.Handler) -> [EventTap] {
    let types: [UInt32] = [1, 2, 6, 3, 4, 7, 25, 26, 27]
    let mask = types.reduce(CGEventMask(0)) { $0 | CGEventMask(1) << $1 }
    func make(_ pid: Int32) -> EventTap {
        let tap = EventTap(location: .process(pid), placement: .headInsertEventTap,
            options: .defaultTap, eventsOfInterest: mask, driver: driver)
        tap.startMonitoring(handler)
        return tap
    }
    var taps = [make(targetPID)]
    if let menuPID { taps.append(make(menuPID)) }
    return taps
}
