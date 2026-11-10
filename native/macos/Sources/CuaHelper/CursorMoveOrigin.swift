import AppKit

// Geometry stage 0x100094898..0x100094950. The frame was captured before
// screen conversion. Reload the style hotspot separately for x and y.
func cursorMoveOrigin(for point: CGPoint, capturedFrame: CGRect,
    zeroScreenFrame: () -> CGRect?, hotspot: () -> CGPoint
) -> CGPoint {
    let convertedY = (zeroScreenFrame()?.maxY ?? 0) - point.y
    let bottom = convertedY - capturedFrame.height
    let hotspotX = hotspot().x
    let hotspotY = hotspot().y
    return CGPoint(x: point.x - hotspotX, y: bottom + hotspotY)
}

extension ComputerUseCursorWindow {
    // Extracted absolute target origin only. The complete Window move also
    // selects an initial origin and handles corresponding-window coordinates.
    func absoluteMoveTargetOrigin(for point: CGPoint) -> CGPoint {
        let capturedFrame = frame
        return cursorMoveOrigin(for: point, capturedFrame: capturedFrame,
            zeroScreenFrame: { NSScreen.screens.first { $0.frame.contains(CGPoint.zero) }?.frame },
            hotspot: { self.style.hotSpot })
    }
}
