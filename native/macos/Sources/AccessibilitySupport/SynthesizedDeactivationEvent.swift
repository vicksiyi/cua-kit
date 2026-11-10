import AppKit

public extension SynthesizedEvent {
    // Original0x100754420: AppKit-defined type13/subtype2, zero position,
    // timestamp, flags, window number and payload; nil NSEvent/CGEvent -> tag0.
    static func notifyAppDeactivated() throws -> SynthesizedEvent {
        guard let event = NSEvent.otherEvent(with: .appKitDefined, location: .zero,
            modifierFlags: [], timestamp: 0, windowNumber: 0, context: nil,
            subtype: 2, data1: 0, data2: 0)?.cgEvent else {
            throw Error.invalidParameter
        }
        return SynthesizedEvent(cgEvents: [event])
    }
}
