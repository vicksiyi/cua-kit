import CoreGraphics

// Read dependencies of the WindowUIElementProtocol existential used at
// 0x1007414c8. The host's full window protocol is not restored yet.
struct SyntheticActivationWindow {
    var activationPoint: () -> CGPoint?
    var windowID: () throws -> UInt32
    var frame: () -> CGRect?
}

// The source reads point before ID, and tolerates an ID lookup failure by
// constructing windowless activation. No fallback geometry/point is invented.
func syntheticWindowActivationEvent(_ window: SyntheticActivationWindow?) throws -> SynthesizedEvent {
    guard let window, let point = window.activationPoint(),
          let id = try? window.windowID() else {
        return try SynthesizedEvent.notifyAppActivated(windowID: 0,
            windowBounds: nil, activationPoint: nil)
    }
    return try SynthesizedEvent.notifyAppActivated(windowID: id,
        windowBounds: window.frame(), activationPoint: point)
}

extension SyntheticApplicationFocusState {
    // Compose restored state transitions with real event builders. The caller
    // owns serialized state and posting; safe-enforce's event-tap scope is separate.
    mutating func enforceActiveState(for window: SyntheticActivationWindow?,
                                    send: (SynthesizedEvent) throws -> Void) throws {
        try enforceActiveState(
            sendKeyFocusReturned: { try send(SynthesizedEvent.notifyWindowKeyFocusReturned()) },
            sendAppActivated: { try send(syntheticWindowActivationEvent(window)) })
    }
}
