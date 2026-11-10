import SlimCore

extension ComputerUseCursorWindow {
    // Native long-move startup 0x100096a24..0x100096a84 and 0x100097124.
    func prepareInitialMotionAngle(path: CursorCubicPath, updatesAngle: Bool) {
        let sample = path.sample(at: 0)
        guard updatesAngle else { return }
        withAnimationDisabled(true) {
            let capturedStyle = style
            capturedStyle.angle = cursorMotionAngle(direction: sample.tangent,
                clickAngle: motionConfiguration.clickAngle)
        }
    }
}
