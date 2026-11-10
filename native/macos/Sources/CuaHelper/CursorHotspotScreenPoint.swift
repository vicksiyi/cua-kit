import CoreGraphics

// Native 0x100090a54 reads the retained window's origin once, then reloads
// frame height and Style hotspot independently before CG coordinate conversion.
func cursorHotspotScreenPoint(frame: () -> CGRect, hotspot: () -> CGPoint,
    zeroScreenFrame: () -> CGRect?
) -> CGPoint {
    let origin = frame().origin
    let x = origin.x + hotspot().x
    let top = origin.y + frame().height
    let y = top - hotspot().y
    return CGPoint(x: x, y: (zeroScreenFrame()?.maxY ?? 0) - y)
}
