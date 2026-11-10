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
        let startNumber = SynthesizedEvent.nextEventNumber
        let bounds = CGRect(x: -500, y: 40, width: 600, height: 400)
        let point = CGPoint(x: -400, y: 90)
        for id: UInt32 in [0, 123] {
            for geometry in [false, true] {
                for hasPoint in [false, true] {
                    let activation = try SynthesizedEvent.notifyAppActivated(windowID: id,
                        windowBounds: geometry ? bounds : nil, activationPoint: hasPoint ? point : nil)
                    let clicks = id != 0 && geometry && hasPoint
                    precondition(activation.cgEvents.count == (clicks ? 3 : 1))
                    let notification = NSEvent(cgEvent: activation.cgEvents[0])!
                    precondition(notification.type == .appKitDefined && notification.subtype.rawValue == 1)
                    precondition(notification.modifierFlags.rawValue == (id == 0 ? 0 : 0xc0000))
                    precondition(notification.windowNumber == Int(id))
                    precondition(notification.timestamp == 0 && notification.locationInWindow == .zero)
                    precondition(notification.data1 == 0 && notification.data2 == 0)
                    if clicks {
                        let pair = Array(activation.cgEvents.dropFirst())
                        precondition(pair.map { $0.type } == [.leftMouseDown, .leftMouseUp])
                        precondition(pair.map { $0.getIntegerValueField(.mouseEventNumber) } == [1, 2])
                        precondition(pair.allSatisfy { $0.flags.isEmpty && $0.location == point })
                    }
                }
            }
        }
        precondition(SynthesizedEvent.nextEventNumber == startNumber + 1)
        print("AccessibilitySupport focus/deactivation notification fields passed; no event posting")
    }
}
