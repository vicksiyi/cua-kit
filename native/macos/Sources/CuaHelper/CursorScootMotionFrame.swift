import Animation
import AppKit
import Darwin

extension ComputerUseCursorWindow {
    // Composed native0x100097410 tick; auxiliary springs retain their own drivers.
    func applyScootMotionFrame(start: CGPoint, target: CGPoint, position: CGPoint, finished: Bool,
        direction: CGPoint, correspondingWindowFrame: () -> CGRect?,
        afterMove: ((CGPoint) -> Void)? = nil,
        enqueueAuxiliary: @MainActor (SpringAnimation<CGFloat>, ComputerUseCursorWindow) -> Void = {
            $0.start(afterDelay: .zero, drivenBy: $1)
        }
    ) {
        let sample = cursorLinearMotionSample(start: start, target: target, position: position)
        let frame = correspondingWindowFrame()
        applyMotionFrameOrigin(position, correspondingWindowFrame: frame, afterMove: afterMove)
        let axis = cursorScootAxisGeometry(direction: direction, configuration: motionConfiguration)
        updateScootAxis(degrees: axis.degrees, enqueue: enqueueAuxiliary)
        let targets = cursorScootShapeTargets(envelope: sample.envelope, direction: direction,
            axisPivotX: axis.pivotX, configuration: motionConfiguration)
        updateScootStretch(scale: targets.scale, xScale: targets.xScale, pivotX: targets.pivotX,
            enqueue: enqueueAuxiliary)
        updateScootTilt(degrees: targets.tiltDegrees, enqueue: enqueueAuxiliary)
        style.velocityX = 0
        style.velocityY = 0
        if finished {
            finishScootMotion(target: target, correspondingWindowFrame: frame)
        } else {
            updateCloseEnoughInteraction(progress: sample.progress,
                distance: hypot(target.x - position.x, target.y - position.y))
        }
    }

    func bindScootEvents(_ animation: SpringAnimation<CGPoint>, start: CGPoint, target: CGPoint,
        direction: CGPoint, correspondingWindowFrame: @escaping () -> CGRect?,
        afterMove: ((CGPoint) -> Void)? = nil,
        enqueueAuxiliary: @escaping @MainActor (SpringAnimation<CGFloat>, ComputerUseCursorWindow) -> Void = {
            $0.start(afterDelay: .zero, drivenBy: $1)
        }
    ) {
        animation.eventHandler = { [weak self, weak animation] event in
            guard let self, let animation, self.cursorScootPositionAnimation === animation else { return }
            let position: CGPoint
            let finished: Bool
            switch event {
            case .valueChanged(_, let value): position = value; finished = false
            case .finished(let value): position = value; finished = true
            case .retargeted: return
            }
            self.applyScootMotionFrame(start: start, target: target, position: position, finished: finished,
                direction: direction, correspondingWindowFrame: correspondingWindowFrame, afterMove: afterMove,
                enqueueAuxiliary: enqueueAuxiliary)
        }
    }
}
