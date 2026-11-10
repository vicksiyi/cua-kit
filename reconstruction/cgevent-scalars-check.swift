import CoreGraphics
import SystemSoftware

@main struct Check {
    static func main() {
        let event = CGEvent(source: nil)!
        for flags: CGEventFlags in [[], .maskShift, [.maskCommand, .maskAlternate]] {
            CGEventAPI.setFlags(event, flags: flags)
            precondition(CGEventAPI.getFlags(event) == flags && event.flags == flags)
        }
        for point in [CGPoint.zero, CGPoint(x: -401.5, y: 90.25), CGPoint(x: 2048, y: -99)] {
            CGEventAPI.setLocation(event, location: point)
            precondition(CGEventAPI.getLocation(event) == point && event.location == point)
        }
        for timestamp: UInt64 in [0, 1, 0x8000000000000000, UInt64.max] {
            CGEventAPI.setTimestamp(event, timestamp: timestamp)
            precondition(CGEventAPI.getTimestamp(event) == timestamp && event.timestamp == timestamp)
        }
        for type: CGEventType in [.null, .mouseMoved, .keyDown, .scrollWheel] {
            CGEventAPI.setType(event, type: type)
            precondition(CGEventAPI.getType(event) == type && event.type == type)
        }
        print("SystemSoftware CGEvent scalar flags/location/timestamp/type checks passed; no event posting")
    }
}
