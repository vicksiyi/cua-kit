import CoreGraphics

extension SynthesizedEvent {
    // Original0x100754d5c: consume/increment event number before allocation;
    // NSEvent mouseMoved, clickCount1, button0, flags0, pressure1. Its remaining
    // construction matches mouseEvent's optional window/bounds branches.
    static func moveMouse(to point: CGPoint, inWindow windowID: UInt32?,
        windowBounds: CGRect?, windowUsesFlippedCoordinates: Bool
    ) throws -> SynthesizedEvent {
        try mouseEvent(eventNumber: nextEventNumber, type: .mouseMoved,
            clickCount: 1, at: point, mouseButton: .left, flags: [],
            inWindow: windowID, windowBounds: windowBounds,
            windowUsesFlippedCoordinates: windowUsesFlippedCoordinates)
    }
}
