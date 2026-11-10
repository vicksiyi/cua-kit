import AppKit

public extension SynthesizedEvent {
    // Pinned native optional constants: processNotification=21 (0x10072f560),
    // taken=0x4000 (0x10072f6b0), returned=0x8000 (0x10072f6e8).
    static func notifyWindowKeyFocusRemoved() throws -> SynthesizedEvent {
        try keyFocusNotification(subtype: 0x4000)
    }
    static func notifyWindowKeyFocusReturned() throws -> SynthesizedEvent {
        try keyFocusNotification(subtype: Int16(bitPattern: 0x8000))
    }
    private static func keyFocusNotification(subtype: Int16) throws -> SynthesizedEvent {
        guard let type = NSEvent.EventType(rawValue: 21),
              let event = NSEvent.otherEvent(with: type, location: .zero,
                modifierFlags: [], timestamp: 0, windowNumber: 0, context: nil,
                subtype: subtype, data1: 0, data2: 0)?.cgEvent else {
            throw Error.invalidParameter
        }
        return SynthesizedEvent(cgEvents: [event])
    }
}
