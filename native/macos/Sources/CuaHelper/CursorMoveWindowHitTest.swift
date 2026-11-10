import AppKit

// Native0x1000953e4. True only when both endpoint hotspots miss the
// corresponding window. A missing target ID does not suppress animation.
func cursorMoveEndpointsMissWindow(firstOrigin: CGPoint, secondOrigin: CGPoint,
    correspondingWindowID: UInt32?, hotspot: () -> CGPoint, frame: () -> CGRect,
    hitTest: (CGPoint) -> Int
) -> Bool {
    guard let id = correspondingWindowID else { return false }
    func point(_ origin: CGPoint) -> CGPoint {
        let x = origin.x + hotspot().x
        let top = frame().height + origin.y
        let y = top - hotspot().y
        return CGPoint(x: x, y: y)
    }
    if hitTest(point(firstOrigin)) == Int(id) { return false }
    return hitTest(point(secondOrigin)) != Int(id)
}

extension ComputerUseCursorWindow {
    func moveEndpointsMissWindow(firstOrigin: CGPoint, secondOrigin: CGPoint) -> Bool {
        cursorMoveEndpointsMissWindow(firstOrigin: firstOrigin, secondOrigin: secondOrigin,
            correspondingWindowID: correspondingWindowID, hotspot: { self.style.hotSpot },
            frame: { self.frame }, hitTest: {
                NSWindow.windowNumber(at: $0, belowWindowWithWindowNumber: 0)
            })
    }
}
