import AppKit

// NSScreen.bestScreen0x100260e0c: an intersecting preference wins immediately;
// otherwise materialize all intersection areas and choose the first maximum.
// Even zero overlap selects the first available screen; only no screens is nil.
public func bestWindowScreen<Screen>(for bounds: CGRect, preferred: Screen?,
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

public extension NSScreen {
    @MainActor
    static func bestScreen(for bounds: CGRect, preferredScreen: NSScreen?) -> NSScreen? {
        bestWindowScreen(for: bounds, preferred: preferredScreen,
            screens: { NSScreen.screens }, frame: { $0.frame })
    }
}

public extension CGWindow {
    @MainActor
    var screen: NSScreen? {
        NSScreen.bestScreen(for: bounds, preferredScreen: nil)
    }

    @MainActor
    var scale: CGFloat {
        NSScreen.bestScreen(for: bounds, preferredScreen: nil)?.backingScaleFactor ?? 2
    }
}
