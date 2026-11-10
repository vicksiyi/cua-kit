import AppKit
import Darwin

extension ComputerUseCursorWindow {
    // Joins the recovered phases of 0x1000979c4. The animation installer
    // supplies event phase, live velocity reader and window lookup.
    func applyProgressMotionFrame(path: CursorCubicPath, progress: CGFloat, finished: Bool,
        updatesAngle: Bool, correspondingWindowFrame: () -> CGRect?,
        progressVelocity: () -> CGFloat,
        afterMove: ((CGPoint) -> Void)? = nil
    ) {
        let sample = path.sample(at: progress)
        let frame = correspondingWindowFrame()
        let previous = currentInterpolatedOrigin
        applyMotionFrameOrigin(sample.position, correspondingWindowFrame: frame, afterMove: afterMove)
        if updatesAngle {
            let capturedStyle = style
            let direction = cursorTerminalDirection(sample.tangent, progress: progress,
                configuration: motionConfiguration)
            capturedStyle.angle = cursorMotionAngle(direction: direction,
                clickAngle: motionConfiguration.clickAngle)
        }
        if finished {
            finishProgressMotion()
            return
        }
        let target = path.segments.last!.endpoint
        let distance = hypot(target.x - sample.position.x, target.y - sample.position.y)
        updateCloseEnoughInteraction(progress: progress, distance: distance)
        // Read after interaction callback: the native callback may reenter and
        // mutate animation/window state before the original velocity read.
        updateProgressVelocity(tangent: sample.tangent, segmentCount: path.segments.count,
            progressVelocity: progressVelocity(), position: sample.position, previousPosition: previous)
    }
}
