import CoreGraphics

// Native progress tick 0x100097e0c..0x100097edc. Derivative is local
// segment t, so global progress velocity is scaled by segment count first.
func cursorProgressVelocity(tangent: CGPoint, segmentCount: Int, progressVelocity: CGFloat,
    position: CGPoint, previousPosition: CGPoint
) -> CGPoint {
    let scale = progressVelocity * CGFloat(segmentCount)
    let x = tangent.x * scale
    let y = tangent.y * scale
    let magnitude = (x * x + y * y).squareRoot()
    // B.LE takes zero and unordered to positional delta, without dt division.
    if magnitude > 0 { return CGPoint(x: x, y: y) }
    return CGPoint(x: position.x - previousPosition.x, y: position.y - previousPosition.y)
}

@MainActor
func applyCursorProgressVelocity(_ velocity: CGPoint, style: () -> ComputerUseCursorStyle) {
    style().velocityX = velocity.x
    // Native reloads the live window style after the first setter.
    style().velocityY = velocity.y
}

extension ComputerUseCursorWindow {
    func updateProgressVelocity(tangent: CGPoint, segmentCount: Int, progressVelocity: CGFloat,
        position: CGPoint, previousPosition: CGPoint
    ) {
        let velocity = cursorProgressVelocity(tangent: tangent, segmentCount: segmentCount,
            progressVelocity: progressVelocity, position: position, previousPosition: previousPosition)
        applyCursorProgressVelocity(velocity, style: { self.style })
    }
}
