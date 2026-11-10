import CoreGraphics
import SystemSoftware

public extension SynthesizedEvent {
    // Original0x100754a60: source is created before checked Int32 conversions.
    static func scroll(at point: CGPoint, deltaX: Int, deltaY: Int,
        inWindow windowID: UInt32?, windowBounds: CGRect?,
        windowUsesFlippedCoordinates: Bool
    ) throws -> SynthesizedEvent {
        guard let source = CGEventSource(stateID: .hidSystemState) else {
            throw Error.failedToCreateSource
        }
        guard let event = CGEvent(scrollWheelEvent2Source: source, units: .pixel,
            wheelCount: 1, wheel1: Int32(deltaY), wheel2: Int32(deltaX), wheel3: 0) else {
            throw Error.invalidParameter
        }
        CGEventAPI.setLocation(event, location: point)
        if let windowID {
            if let field = CGEventField(rawValue: 51) {
                CGEventAPI.setIntegerValueField(event, field: field, value: Int64(windowID))
            }
            CGEventAPI.setIntegerValueField(event, field: .mouseEventWindowUnderMousePointer, value: Int64(windowID))
            CGEventAPI.setIntegerValueField(event, field: .mouseEventWindowUnderMousePointerThatCanHandleThisEvent, value: Int64(windowID))
            if let bounds = windowBounds {
                var local = CGEventAPI.getLocation(event).applying(CGAffineTransform(translationX: -bounds.minX, y: -bounds.minY))
                if windowUsesFlippedCoordinates { local.y = bounds.height - local.y }
                WindowServerSPI.setWindowLocation(event, location: local)
            }
        }
        return SynthesizedEvent(cgEvents: [event])
    }
}
