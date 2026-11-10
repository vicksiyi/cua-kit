import AppKit

// Readable extraction of 0x10009d3a8. This selects the planning domain;
// it does not generate a curve or substitute for the missing movement entry.
@MainActor
func cursorPathBounds(start: CGPoint, target: CGPoint, correspondingWindowFrame: CGRect?,
    screenFrames: () -> [CGRect] = { NSScreen.screens.map { $0.frame } },
    zeroScreenFrame: () -> CGRect? = {
        NSScreen.screens.first { $0.frame.contains(CGPoint.zero) }?.frame
    }
) -> CGRect {
    if let frame = correspondingWindowFrame {
        // The original performs CG -> AppKit conversion, then discards origin.
        let converted = CGRect(x: frame.origin.x,
            y: (zeroScreenFrame()?.maxY ?? 0) - (frame.origin.y + frame.size.height),
            width: frame.size.width, height: frame.size.height)
        return CGRect(origin: .zero, size: converted.size)
    }
    let frames = screenFrames()
    for frame in frames {
        // Screen order wins over a global preference for the starting screen.
        if frame.contains(start) || frame.contains(target) { return frame }
    }
    return frames.reduce(CGRect.null) { $0.union($1) }
}
