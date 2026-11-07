import CoreGraphics

extension SynthesizedEvent {
    // Native entry 0x100754a60: one pixel wheel event, HID-system source,
    // wheel1=deltaY, wheel2=deltaX, wheel3=0, then global/window coordinates.
    // Pending: native optional dynamic window field before fields 91/92.
    // Those public mouse fields alone do not establish wheel-event routing.
    static func scroll(at point: CGPoint, deltaX: Int, deltaY: Int,
                       inWindow window: MouseWindow? = nil) throws -> SynthesizedEvent {
        guard let source = CGEventSource(stateID: .hidSystemState) else {
            throw Error.failedToCreateSource
        }
        guard let event = CGEvent(scrollWheelEvent2Source: source, units: .pixel,
                                  wheelCount: 1, wheel1: Int32(deltaY),
                                  wheel2: Int32(deltaX), wheel3: 0) else {
            throw fail("PROVIDER_DISCONNECTED", "Cannot allocate scroll event.")
        }
        event.location = point
        if let window { try applyMouseWindow(window, to: event) }
        return SynthesizedEvent(cgEvents: [event])
    }
}
