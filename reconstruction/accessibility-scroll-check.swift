import AccessibilitySupport
import CoreGraphics
import Darwin

@main struct Check {
    static func main() throws {
        typealias Getter = @convention(c) (CGEvent) -> CGPoint
        let get = unsafeBitCast(dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CGEventGetWindowLocation")!, to: Getter.self)
        let point = CGPoint(x: -400, y: 90)
        let bounds = CGRect(x: -500, y: 40, width: 600, height: 400)
        for id: UInt32? in [nil, 0, 123] {
            for geometry: CGRect? in [nil, bounds] {
                for flipped in [false, true] {
                    let result = try SynthesizedEvent.scroll(at: point, deltaX: 0, deltaY: -5,
                        inWindow: id, windowBounds: geometry, windowUsesFlippedCoordinates: flipped)
                    precondition(result.cgEvents.count == 1)
                    let event = result.cgEvents[0]
                    precondition(event.type == .scrollWheel && event.location == point)
                    precondition(event.getIntegerValueField(.scrollWheelEventPointDeltaAxis1) == -5)
                    if let id {
                        precondition(event.getIntegerValueField(CGEventField(rawValue: 51)!) == Int64(id))
                        // Native scroll events may not retain mouse-only fields91/92.
                        // Compare isolated public-API writes; do not claim the ID survived.
                        let baseline = CGEvent(scrollWheelEvent2Source: nil, units: .pixel,
                            wheelCount: 1, wheel1: -5, wheel2: 0, wheel3: 0)!
                        for field in [CGEventField.mouseEventWindowUnderMousePointer,
                                      .mouseEventWindowUnderMousePointerThatCanHandleThisEvent] {
                            baseline.setIntegerValueField(field, value: Int64(id))
                            let actual = event.getIntegerValueField(field)
                            precondition(actual == baseline.getIntegerValueField(field))
                            if id != 0 && geometry == nil && !flipped {
                                print("Scroll field \(field.rawValue) requested=\(id) retained=\(actual); same behavior as confirmed original-request system binding")
                            }
                        }
                        if geometry != nil { precondition(get(event) == CGPoint(x: 100, y: flipped ? 350 : 50)) }
                    }
                }
            }
        }
        print("AccessibilitySupport scroll optional routing/geometry checks passed; no event posting")
    }
}
