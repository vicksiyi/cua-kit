import AppKit

extension ComputerUseCursorWindow {
    // Native immediate branch0x100094bb4..0x100094e80. Inputs already
    // resolved by outer move. Do not reuse the animated-frame writeback:
    // source neither rounds absolute origin nor overwrites interpolated state.
    func completeImmediateMove(initialRelative: CGPoint, targetRelative: CGPoint,
        targetAbsolute: CGPoint, bounds: () -> CGRect, updatesAngle: Bool,
        interaction: (() -> Void)?, completion: (() -> Void)?,
        setAbsoluteOrigin: ((CGPoint) -> Void)? = nil
    ) {
        clearTemporaryMoveOverlay()
        if let setAbsoluteOrigin { setAbsoluteOrigin(targetAbsolute) }
        else { setFrameOrigin(targetAbsolute) }
        let domain = bounds()
        let path = planCursorPath(start: initialRelative, target: targetRelative,
            bounds: domain, configuration: motionConfiguration)
        if updatesAngle {
            let capturedStyle = style
            let sample = path.sample(at: 1)
            let direction = cursorTerminalDirection(sample.tangent, progress: 1,
                configuration: motionConfiguration)
            capturedStyle.angle = cursorMotionAngle(direction: direction,
                clickAngle: motionConfiguration.clickAngle)
        }
        interaction?()
        completion?()
    }
}
