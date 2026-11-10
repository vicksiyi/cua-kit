import AppKit

struct CursorMoveOrigins {
    let initial: CGPoint
    let target: CGPoint
}

extension ComputerUseCursorWindow {
    // Extracted 0x100094a2c..0x100094ac4. The caller resolves the optional
    // corresponding CGWindow frame before this stage. An animation object's
    // presence selects currentInterpolatedOrigin even when it has ended.
    func prepareMoveOrigins(initialAbsolute: CGPoint, targetAbsolute: CGPoint,
        correspondingWindowFrame: CGRect?,
        zeroScreenFrame: () -> CGRect? = {
            NSScreen.screens.first { $0.frame.contains(CGPoint.zero) }?.frame
        }
    ) -> CursorMoveOrigins {
        func relative(_ point: CGPoint) -> CGPoint {
            guard let frame = correspondingWindowFrame else { return point }
            // Preserve the raw signed height in CG -> AppKit rect conversion.
            let origin = CGPoint(x: frame.origin.x,
                y: (zeroScreenFrame()?.maxY ?? 0) - (frame.origin.y + frame.size.height))
            return CGPoint(x: point.x - origin.x, y: point.y - origin.y)
        }
        var initial = relative(initialAbsolute)
        if cursorMotionProgressAnimation != nil || cursorScootPositionAnimation != nil {
            initial = currentInterpolatedOrigin
        }
        resetCursorWindowState()
        currentInterpolatedOrigin = initial
        // Native code repeats the screen conversion after reset callbacks.
        let target = relative(targetAbsolute)
        return CursorMoveOrigins(initial: initial, target: target)
    }
}
