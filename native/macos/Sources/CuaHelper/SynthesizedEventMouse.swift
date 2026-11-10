import AppKit
import CoreGraphics
import SystemSoftware

extension SynthesizedEvent {
    // Original field descriptor0x101323788: four payload-free cases in this order.
    enum MouseEventType: Hashable {
        case mouseDown, mouseUp, mouseDragged, mouseMoved
    }

    // Original0x1007547d4; window identity and bounds are independently optional.
    static func mouseEvent(eventNumber: Int64, type: MouseEventType, clickCount: Int,
        at point: CGPoint, mouseButton: CGMouseButton, flags: CGEventFlags,
        inWindow windowID: UInt32?, windowBounds: CGRect?,
        windowUsesFlippedCoordinates: Bool
    ) throws -> SynthesizedEvent {
        // Native mapping tables0x1011921f0/200/210: left/right/other; moved is5.
        let appKitType: NSEvent.EventType
        switch (type, mouseButton) {
        case (.mouseMoved, _): appKitType = .mouseMoved
        case (.mouseDown, .left): appKitType = .leftMouseDown
        case (.mouseUp, .left): appKitType = .leftMouseUp
        case (.mouseDragged, .left): appKitType = .leftMouseDragged
        case (.mouseDown, .right): appKitType = .rightMouseDown
        case (.mouseUp, .right): appKitType = .rightMouseUp
        case (.mouseDragged, .right): appKitType = .rightMouseDragged
        case (.mouseDown, _): appKitType = .otherMouseDown
        case (.mouseUp, _): appKitType = .otherMouseUp
        case (.mouseDragged, _): appKitType = .otherMouseDragged
        }
        guard let event = NSEvent.mouseEvent(with: appKitType, location: point,
            modifierFlags: [], timestamp: 0, windowNumber: Int(windowID ?? 0),
            context: nil, eventNumber: Int(eventNumber), clickCount: clickCount,
            pressure: 1)?.cgEvent else { throw Error.invalidParameter }
        event.flags = flags
        event.location = point
        event.setIntegerValueField(.mouseEventButtonNumber, value: Int64(mouseButton.rawValue))
        event.setIntegerValueField(.mouseEventSubtype, value: 3)
        if let windowID {
            event.setIntegerValueField(.mouseEventWindowUnderMousePointer, value: Int64(windowID))
            event.setIntegerValueField(.mouseEventWindowUnderMousePointerThatCanHandleThisEvent, value: Int64(windowID))
            if let bounds = windowBounds {
                var local = event.location.applying(CGAffineTransform(translationX: -bounds.minX, y: -bounds.minY))
                if windowUsesFlippedCoordinates { local.y = bounds.height - local.y }
                WindowServerSPI.setWindowLocation(event, location: local)
            }
        }
        return SynthesizedEvent(cgEvents: [event])
    }
}
