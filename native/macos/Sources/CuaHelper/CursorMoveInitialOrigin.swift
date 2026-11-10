import CoreGraphics

// Native 0x100094974..0x100094a28. petLocation is the externally hosted
// pet position, read from0x101550708. It is not a cached previous cursor
// point and must not be updated after cursor movement.
func cursorMoveInitialOrigin(targetOrigin: CGPoint, wasVisible: Bool, animated: Bool,
    petLocation: CGPoint?, capturedWindowFrame: CGRect,
    hotspot: () -> CGPoint, currentWindowFrame: () -> CGRect
) -> CGPoint {
    var previousOrigin: CGPoint?
    if let point = petLocation {
        let x = point.x - hotspot().x
        let bottom = point.y - capturedWindowFrame.height
        let y = bottom + hotspot().y
        previousOrigin = CGPoint(x: x, y: y)
    }
    // Always perform this fresh frame read, including hidden/no-animation.
    let frame = currentWindowFrame()
    if wasVisible { return frame.origin }
    if animated, let previousOrigin { return previousOrigin }
    return targetOrigin
}
