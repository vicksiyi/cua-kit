import CoreGraphics

public extension SynthesizedEvent {
    // Original0x1007536ec ->0x100755a4c. Count>=1; no native upper cap.
    // A drag adds exactly start/midpoint/end drag events, not interpolation.
    static func click(at point: CGPoint, andDragTo destination: CGPoint?,
        mouseButton: CGMouseButton, count: Int, flags: CGEventFlags,
        inWindow windowID: UInt32?, windowBounds: CGRect?,
        windowUsesFlippedCoordinates: Bool
    ) throws -> SynthesizedEvent {
        guard count >= 1 else { throw Error.invalidParameter }
        var events: [CGEvent] = []
        for clickCount in 1...count {
            let number = nextEventNumber
            func make(_ type: MouseEventType, at position: CGPoint, number: Int64, count: Int) throws -> SynthesizedEvent {
                try mouseEvent(eventNumber: number, type: type, clickCount: count,
                    at: position, mouseButton: mouseButton, flags: flags,
                    inWindow: windowID, windowBounds: windowBounds,
                    windowUsesFlippedCoordinates: windowUsesFlippedCoordinates)
            }
            events.append(contentsOf: try make(.mouseDown, at: point, number: number, count: clickCount).cgEvents)
            if let destination {
                let dragNumber = nextEventNumber
                let midpoint = CGPoint(x: (point.x + destination.x) * 0.5,
                    y: (point.y + destination.y) * 0.5)
                for position in [point, midpoint, destination] {
                    events.append(contentsOf: try make(.mouseDragged, at: position, number: dragNumber, count: 0).cgEvents)
                }
            }
            events.append(contentsOf: try make(.mouseUp, at: destination ?? point,
                number: number, count: clickCount).cgEvents)
        }
        return SynthesizedEvent(cgEvents: events)
    }
}
