import CoreGraphics
import Darwin

// Readable extraction of 0x100097490..0x10009753c. The second value is the
// native motion envelope, not elapsed-time progress or completion state.
struct CursorLinearMotionSample {
    let progress: CGFloat
    let envelope: CGFloat
}

func cursorLinearMotionSample(start: CGPoint, target: CGPoint, position: CGPoint) -> CursorLinearMotionSample {
    let dx = target.x - start.x
    let dy = target.y - start.y
    let lengthSquared = dx * dx + dy * dy
    let progress: CGFloat
    // ARM B.LT after FCMP also takes the unordered path here.
    if lengthSquared.isNaN || lengthSquared < 0.001 {
        progress = 1
    } else {
        let projection = (dx * (position.x - start.x) + dy * (position.y - start.y)) / lengthSquared
        if projection <= 0 { progress = 0 }
        else if projection > 1 { progress = 1 }
        else { progress = projection }
    }
    let ratio = progress / 0.22
    let rise = ratio > 1 ? 1 : ratio
    let remainder = 1 - progress
    let fall = remainder <= 0 ? 0 : remainder
    let rawEnvelope = rise * CGFloat(pow(Double(fall), 0.62))
    let lower = rawEnvelope <= 0 ? 0 : rawEnvelope
    let envelope = lower > 1 ? 1 : lower
    return CursorLinearMotionSample(progress: progress, envelope: envelope)
}
