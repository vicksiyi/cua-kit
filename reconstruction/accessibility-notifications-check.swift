import AccessibilitySupport
import AppKit

@main struct Check {
    static func main() throws {
        for (notification, type, subtype) in [
            (try SynthesizedEvent.notifyWindowKeyFocusRemoved(), UInt(21), Int16(0x4000)),
            (try SynthesizedEvent.notifyWindowKeyFocusReturned(), UInt(21), Int16(bitPattern: 0x8000)),
            (try SynthesizedEvent.notifyAppDeactivated(), UInt(13), Int16(2))
        ] {
            precondition(notification.cgEvents.count == 1)
            let event = NSEvent(cgEvent: notification.cgEvents[0])!
            precondition(event.type.rawValue == type && event.subtype.rawValue == subtype)
            precondition(event.windowNumber == 0 && event.modifierFlags.isEmpty)
            precondition(event.locationInWindow == .zero && event.timestamp == 0)
            precondition(event.data1 == 0 && event.data2 == 0)
        }
        print("AccessibilitySupport focus/deactivation notification fields passed; no event posting")
    }
}
