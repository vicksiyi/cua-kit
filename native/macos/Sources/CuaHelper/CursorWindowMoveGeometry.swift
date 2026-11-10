import AppKit

struct CursorWindowMoveGeometry {
    let wasVisible: Bool
    let targetAbsolute: CGPoint
    let initialAbsolute: CGPoint
    let relativeOrigins: CursorMoveOrigins
    let correspondingWindowFrame: CGRect?
    let petLocation: CGPoint?
}

extension ComputerUseCursorWindow {
    // Native0x100094828..0x100094ac4, before initial positioning/association.
    func prepareWindowMoveGeometry(point: CGPoint, aboveWindowID: UInt32?, relativeToWindow: Bool,
        animated: Bool, windowFrame: (UInt32) -> CGRect? = { systemNativeWindowDescription($0)?.bounds },
        zeroScreenFrame: () -> CGRect? = {
            NSScreen.screens.first { $0.frame.contains(CGPoint.zero) }?.frame
        }
    ) -> CursorWindowMoveGeometry {
        updateConstraintsIfNeeded()
        displayIfNeeded()
        let wasVisible = isVisible
        let capturedFrame = frame
        let target = cursorMoveOrigin(for: point, capturedFrame: capturedFrame,
            zeroScreenFrame: zeroScreenFrame, hotspot: { self.style.hotSpot })
        let corresponding: CGRect?
        if relativeToWindow, let id = aboveWindowID { corresponding = windowFrame(id) }
        else { corresponding = nil }
        let pet = HostedPetLocation.point
        let initial = cursorMoveInitialOrigin(targetOrigin: target, wasVisible: wasVisible, animated: animated,
            petLocation: pet, capturedWindowFrame: capturedFrame,
            hotspot: { self.style.hotSpot }, currentWindowFrame: { self.frame })
        let relative = prepareMoveOrigins(initialAbsolute: initial, targetAbsolute: target,
            correspondingWindowFrame: corresponding, zeroScreenFrame: zeroScreenFrame)
        return CursorWindowMoveGeometry(wasVisible: wasVisible, targetAbsolute: target,
            initialAbsolute: initial, relativeOrigins: relative, correspondingWindowFrame: corresponding,
            petLocation: pet)
    }
}
