import CoreGraphics

// IPC element-scroll 0x100161470..0x10016152c. The clickable point is in
// screen coordinates; moveMouse receives integer scaled/window coordinates.
// Int conversion deliberately truncates toward zero, without rounding/clamp.
func elementScrollCursorPosition(
    clickablePoint: CGPoint, scalingFactor: CGFloat, visibleRect: CGRect
) -> AppControllerCursorPosition {
    let scale = scalingFactor > 0 ? scalingFactor : 1
    return AppControllerCursorPosition(
        x: Int((clickablePoint.x - visibleRect.origin.x) / scale),
        y: Int((clickablePoint.y - visibleRect.origin.y) / scale))
}
