import CoreGraphics

// Native windowID getter 0x1000906d4 probes once, then rereads for checked
// UInt32 conversion. A nonpositive first read is nil; do not truncate IDs.
func cursorObservedWindowID(windowNumber: () -> Int) -> UInt32? {
    guard windowNumber() >= 1 else { return nil }
    return UInt32(windowNumber())
}

// Original rect conversion preserves raw signed size and flips origin around
// zeroScreen.maxY, before asking CoreGraphics for the converted rectangle center.
func cursorCenterScreenPoint(frame: CGRect, zeroScreenFrame: CGRect?) -> CGPoint {
    let converted = CGRect(origin: CGPoint(x: frame.origin.x,
        y: (zeroScreenFrame?.maxY ?? 0) - (frame.origin.y + frame.size.height)), size: frame.size)
    return CGPoint(x: converted.midX, y: converted.midY)
}
