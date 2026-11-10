import AppKit

extension ComputerUseCursorWindow {
    // Extracted positional writeback 0x100097a8c..0x100097b6c, also used by
    // the straight-path tick. The following WindowServer association stage is
    // has an explicit fixture override; normal use calls its native binding.
    @discardableResult
    func applyMotionFrameOrigin(_ interpolated: CGPoint, correspondingWindowFrame: CGRect?,
        zeroScreenFrame: () -> CGRect? = {
            NSScreen.screens.first { $0.frame.contains(CGPoint.zero) }?.frame
        }, afterMove: ((CGPoint) -> Void)? = nil
    ) -> CGPoint {
        currentInterpolatedOrigin = interpolated
        var absolute = interpolated
        if let frame = correspondingWindowFrame {
            absolute.x += frame.origin.x
            absolute.y += (zeroScreenFrame()?.maxY ?? 0) - (frame.origin.y + frame.size.height)
        }
        let rounded = CGPoint(x: absolute.x.rounded(.toNearestOrAwayFromZero),
            y: absolute.y.rounded(.toNearestOrAwayFromZero))
        setFrameOrigin(rounded)
        if let afterMove { afterMove(rounded) }
        else { updateMovingWindowAssociation(at: rounded) }
        return rounded
    }
}
