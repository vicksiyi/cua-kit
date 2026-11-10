import CoreGraphics

// moveMouse entry 0x10007e498..0x10007e5c8. Store the requested position
// (nil resets to zero) before geometry/window lookup. Resolution errors do not
// roll back that controller state. Later motion/validation is a separate stage.
func prepareControllerMouseMove<Window, Destination>(
    to requested: AppControllerCursorPosition?,
    writePosition: (AppControllerCursorPosition) -> Void,
    readScale: () -> CGFloat, readVisibleRect: () -> CGRect,
    orderedWindows: () throws -> [Window],
    resolve: (CGPoint, [Window]) throws -> Destination
) throws -> (target: Destination, point: CGPoint) {
    let position = requested ?? AppControllerCursorPosition(x: 0, y: 0)
    writePosition(position)
    let scale = readScale()
    let rect = readVisibleRect()
    let point = position.applying(scalingFactor: scale, convertingToScreenFromWindowFrame: rect)
    return (try resolve(point, orderedWindows()), point)
}
