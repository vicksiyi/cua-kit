import CoreGraphics

// Native axis calculation0x1007a153c..0x1007a16cc. Axis key paths resolve
// to height/minY/maxY, then width/minX/maxX. nil means no axis write needed.
func scrollBarPositionForVisibleTarget(targetMin: CGFloat, targetMax: CGFloat,
    viewportMin: CGFloat, viewportMax: CGFloat, viewportSize: CGFloat,
    contentMin: CGFloat, contentSize: CGFloat, currentValue: CGFloat?
) -> CGFloat? {
    // Per-axis containment gate0x1007a0f0c precedes reading scrollbar value.
    guard targetMin < viewportMin || viewportMax < targetMax else { return nil }
    let range = contentSize - viewportSize
    guard range > 0 else { return nil }
    let delta: CGFloat
    if targetMax - targetMin <= viewportSize {
        delta = ((targetMin + targetMax) - viewportMin - viewportMax) * 0.5
    } else if targetMin < viewportMin {
        delta = targetMin - viewportMin
    } else if viewportMax < targetMax {
        delta = targetMax - viewportMax
    } else {
        return nil
    }
    let offset: CGFloat
    if let value = currentValue {
        let upper = value > 1 ? 1 : value
        offset = range * (value <= 0 ? 0 : upper)
    } else {
        let raw = viewportMin - contentMin
        offset = raw <= 0 ? 0 : (range < raw ? range : raw)
    }
    let requested = delta + offset
    let bounded = requested <= 0 ? 0 : (range < requested ? range : requested)
    return bounded / range
}
