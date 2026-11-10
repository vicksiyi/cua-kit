import AppKit

// NSScreen.bestScreen0x100260e0c: an intersecting preference wins immediately;
// otherwise materialize all intersection areas and choose the first maximum.
// Even zero overlap selects the first available screen; only no screens is nil.
func bestWindowScreen<Screen>(for bounds: CGRect, preferred: Screen?,
    screens: () -> [Screen], frame: (Screen) -> CGRect
) -> Screen? {
    if let preferred, frame(preferred).intersects(bounds) { return preferred }
    let candidates = screens().map { screen in
        let overlap = frame(screen).intersection(bounds)
        return (screen, overlap.width * overlap.height)
    }
    guard var best = candidates.first else { return nil }
    for candidate in candidates.dropFirst() {
        if best.1 < candidate.1 { best = candidate }
    }
    return best.0
}

// CGWindow.scale0x10025b86c: no preferred screen, backing scale of best screen,
// fallback2 only for nil. No main-screen shortcut or scale sanitization.
@MainActor
func nativeWindowScale(for bounds: CGRect) -> CGFloat {
    let screen = bestWindowScreen(for: bounds, preferred: Optional<NSScreen>.none,
        screens: { NSScreen.screens }, frame: { $0.frame })
    return screen?.backingScaleFactor ?? 2
}
