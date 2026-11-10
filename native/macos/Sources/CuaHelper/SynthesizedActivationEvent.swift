import AccessibilitySupport
import AppKit

extension SynthesizedEvent {
    // 0x100754408 -> 0x100730374. A window-targeted activation notification
    // optionally includes a synthetic click when BOTH geometry and point exist.
    static func notifyAppActivated(windowID: UInt32, windowBounds: CGRect?,
                                   activationPoint: CGPoint?) throws -> SynthesizedEvent {
        let notification = try appActivationNotification(windowID: windowID, subtype: 1,
            flags: NSEvent.ModifierFlags(rawValue: windowID == 0 ? 0 : 0xc0000))
        var events = [notification]
        if windowID != 0, let bounds = windowBounds, let point = activationPoint {
            let window = MouseWindow(id: windowID, frame: bounds, usesFlippedCoordinates: false)
            // Activation clicks have fixed event numbers 1 and 2; they do not
            // consume the process-wide ordinary click counter.
            for (type, number) in [(NSEvent.EventType.leftMouseDown, 1), (.leftMouseUp, 2)] {
                guard let event = NSEvent.mouseEvent(with: type, location: point,
                    modifierFlags: [], timestamp: 0, windowNumber: Int(windowID),
                    context: nil, eventNumber: number, clickCount: 1, pressure: 1)?.cgEvent else {
                    throw fail("PROVIDER_DISCONNECTED", "Cannot allocate activation click.")
                }
                event.flags = []
                event.location = point
                event.setIntegerValueField(.mouseEventButtonNumber, value: 0)
                event.setIntegerValueField(.mouseEventSubtype, value: 3)
                try applyMouseWindow(window, to: event)
                events.append(event)
            }
        }
        return SynthesizedEvent(cgEvents: events)
    }
}

private func appActivationNotification(windowID: UInt32, subtype: Int16,
                                       flags: NSEvent.ModifierFlags) throws -> CGEvent {
    guard let event = NSEvent.otherEvent(with: .appKitDefined, location: .zero,
        modifierFlags: flags, timestamp: 0, windowNumber: Int(windowID), context: nil,
        subtype: subtype, data1: 0, data2: 0)?.cgEvent else {
        throw fail("PROVIDER_DISCONNECTED", "Cannot allocate application activation notification.")
    }
    return event
}
