import AppKit

// Native 0x10009aa1c..0x10009abf0: test the hotspot against windows below the
// cursor, then drop the temporary reason only after reaching the target window.
func updateMovingCursorAssociation(origin: CGPoint,
    reasons: () -> CursorOverlayWindowLevelReasons,
    hotspot: () -> CGPoint, frame: () -> CGRect, windowNumber: () -> Int,
    hitWindow: (CGPoint, Int) -> Int, correspondingWindowID: () -> UInt32?,
    setReasons: (CursorOverlayWindowLevelReasons) -> Void,
    setLevel: (Int) -> Void, updateVisibility: () -> Void
) {
    guard reasons().petLaunch else { return }
    let x = origin.x + hotspot().x
    let top = origin.y + frame().height
    let point = CGPoint(x: x, y: top - hotspot().y)
    let hit = UInt32(hitWindow(point, windowNumber()))
    let target = correspondingWindowID()
    let previous = reasons()
    let reached = previous.petLaunch && target == hit
    setReasons(CursorOverlayWindowLevelReasons(appMonitor: previous.appMonitor,
        petLaunch: previous.petLaunch && !reached))
    guard reached else { return }
    if !previous.appMonitor { setLevel(0) }
    updateVisibility()
}

extension ComputerUseCursorWindow {
    func updateMovingWindowAssociation(at origin: CGPoint) {
        updateMovingCursorAssociation(origin: origin,
            reasons: { self.overlayWindowLevelReasons }, hotspot: { self.style.hotSpot },
            frame: { self.frame }, windowNumber: { self.windowNumber },
            hitWindow: { NSWindow.windowNumber(at: $0, belowWindowWithWindowNumber: $1) },
            correspondingWindowID: { self.correspondingWindowID },
            setReasons: { self.overlayWindowLevelReasons = $0 },
            setLevel: { self.setCursorWindowLevel($0) },
            updateVisibility: { self.updateVisibility() })
    }
}
