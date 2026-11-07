import CoreGraphics

struct SystemFocusNotificationConstants {
    var subtypeField: CGEventField? = CGEventField(rawValue: 64)
    var focusPIDField: CGEventField? = CGEventField(rawValue: 73)
    var taken: UInt16? = 0x4000
    var returned: UInt16? = 0x8000
    var changed: UInt16? = 0xf102
    var newFront: UInt16? = 2
}

// 0x10074c724: caller supplies a live owner. Preserve optional equality,
// checked conversions and the second subtype read after the ViewBridge gate.
// Changed handling returns the original event; other handlers may suppress.
func routeSystemFocusNotification(_ event: CGEvent, viewBridgePID: Int32?,
    constants: SystemFocusNotificationConstants = .init(),
    readInteger: (CGEvent, CGEventField) -> Int64 = { $0.getIntegerValueField($1) },
    taken: (CGEvent, Int32, Int32) -> CGEvent?,
    returned: (CGEvent, Int32) -> CGEvent?,
    changed: (CGEvent, Int32) -> Void,
    newFront: (CGEvent) -> CGEvent?
) -> CGEvent? {
    let destination = Int32(readInteger(event, .eventTargetUnixProcessID))
    func subtype() -> UInt16? {
        guard let field = constants.subtypeField else { return nil }
        return UInt16(readInteger(event, field))
    }
    let firstSubtype = subtype()
    if firstSubtype == constants.taken {
        guard let field = constants.focusPIDField else { return event }
        return taken(event, Int32(readInteger(event, field)), destination)
    }
    if firstSubtype == constants.returned { return returned(event, destination) }
    guard viewBridgePID == destination else { return event }
    let secondSubtype = subtype()
    if secondSubtype == constants.changed {
        guard let field = constants.focusPIDField else { return event }
        changed(event, Int32(readInteger(event, field)))
        return event
    }
    if secondSubtype == constants.newFront { return newFront(event) }
    return event
}
