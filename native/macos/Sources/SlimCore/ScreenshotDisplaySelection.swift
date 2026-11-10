import CoreGraphics

// Buffer display selection 0x100fb912c..0x100fb9270. Pairwise comparisons
// re-read both frames each time; equal or unordered areas retain the first.
public func screenshotDisplay<Display>(for region: CGRect, displays: [Display],
    frame: (Display) -> CGRect
) -> Display? {
    guard var best = displays.first else { return nil }
    for candidate in displays.dropFirst() {
        let bestOverlap = frame(best).intersection(region)
        let bestArea = bestOverlap.width * bestOverlap.height
        let candidateOverlap = frame(candidate).intersection(region)
        let candidateArea = candidateOverlap.width * candidateOverlap.height
        if bestArea < candidateArea { best = candidate }
    }
    return best
}

// The inclusion route keeps the initial first display (fb8c94), then reads
// displays again for overlap selection. If that second list became empty,
// fb930c..fb9320 retains the initial display rather than failing selection.
public func screenshotDisplay<Display>(for region: CGRect, initialDisplay: Display,
    displays: () -> [Display], frame: (Display) -> CGRect
) -> Display {
    screenshotDisplay(for: region, displays: displays(), frame: frame) ?? initialDisplay
}
