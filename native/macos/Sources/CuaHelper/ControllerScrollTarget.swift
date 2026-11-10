import CoreGraphics

//0x100081a98..0x100081c78: the target is selected from an initial point,
// then geometry is reread after process validation for event construction.
// Do not cache the first transformed point across that validation boundary.
func prepareControllerScrollTarget<Window, Target>(
    readPosition: () -> AppControllerCursorPosition,
    readScale: () -> CGFloat, readVisibleRect: () -> CGRect,
    orderedWindows: () throws -> [Window],
    resolve: (CGPoint, [Window]) throws -> Target,
    validateProcess: (Target) throws -> Void
) throws -> (target: Target, point: CGPoint) {
    let position = readPosition()
    let scale = readScale()
    let rect = readVisibleRect()
    let initialPoint = position.applying(scalingFactor: scale, convertingToScreenFromWindowFrame: rect)
    let target = try resolve(initialPoint, orderedWindows())
    try validateProcess(target)
    let currentScale = readScale()
    let currentRect = readVisibleRect()
    let currentPosition = readPosition()
    return (target, currentPosition.applying(scalingFactor: currentScale,
        convertingToScreenFromWindowFrame: currentRect))
}
