import CoreGraphics

// Native descriptor 0x1012ccc98 / field descriptor 0x10132376c:
// one immutable field cgEvents: [__C.CGEvent]. Event construction and posting
// methods are restored separately; this storage does not synthesize/post events.
struct SynthesizedEvent {
    let cgEvents: [CGEvent]

    // Descriptor 0x1012cccd0 / fields 0x1013237c8. No associated payloads.
    enum Error: Swift.Error, Hashable {
        case invalidParameter
        case failedToCreateSource
        case failedToTranslateKeyCodes
        case cannotClickOffscreenElement
    }
}
