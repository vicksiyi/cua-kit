import CoreGraphics

// ComputerUseAppController.CursorPosition storage and applying0x100082438.
// This type uses integer scaled coordinates; geometry conversion does not
// normalize, clamp, flip Y or use the frame's minX/minY in place of origin.
struct AppControllerCursorPosition: Equatable {
    var x: Int
    var y: Int

    func applying(scalingFactor: CGFloat, convertingToScreenFromWindowFrame frame: CGRect?) -> CGPoint {
        let scaled = CGPoint(x: CGFloat(x), y: CGFloat(y))
            .applying(CGAffineTransform(scaleX: scalingFactor, y: scalingFactor))
        guard let frame else { return scaled }
        return scaled.applying(CGAffineTransform(translationX: frame.origin.x, y: frame.origin.y))
    }
}
