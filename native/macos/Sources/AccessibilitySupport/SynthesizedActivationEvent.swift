import AppKit

public extension SynthesizedEvent {
    // Original0x100754408 -> 0x100730374. Notification precedes optional clicks.
    static func notifyAppActivated(windowID: UInt32, windowBounds: CGRect?,
        activationPoint: CGPoint?
    ) throws -> SynthesizedEvent {
        guard let notification = NSEvent.otherEvent(with: .appKitDefined, location: .zero,
            modifierFlags: NSEvent.ModifierFlags(rawValue: windowID == 0 ? 0 : 0xc0000),
            timestamp: 0, windowNumber: Int(windowID), context: nil,
            subtype: 1, data1: 0, data2: 0)?.cgEvent else { throw Error.invalidParameter }
        var events = [notification]
        if windowID != 0, let bounds = windowBounds, let point = activationPoint {
            // Fixed numbers; do not consume the ordinary global event counter.
            for (type, number) in [(MouseEventType.mouseDown, Int64(1)), (.mouseUp, 2)] {
                let click = try mouseEvent(eventNumber: number, type: type, clickCount: 1,
                    at: point, mouseButton: .left, flags: [], inWindow: windowID,
                    windowBounds: bounds, windowUsesFlippedCoordinates: false)
                events.append(contentsOf: click.cgEvents)
            }
        }
        return SynthesizedEvent(cgEvents: events)
    }
}
