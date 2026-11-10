import CoreGraphics

// Source0x1007a48b8..0x1007a494c uses zero for an absent parent frame, then
// intersects an optional clip.0x1007a4b44..0x1007a4b70 insets the resulting
// viewport by1 on each axis before testing every child rectangle.
func uiElementPositionVisibility(parentFrame: CGRect?, clippingFrame: CGRect?,
    childFrames: [CGRect?]) -> [Bool] {
    let parent = parentFrame ?? .zero
    let viewport = clippingFrame.map { parent.intersection($0) } ?? parent
    let interior = viewport.insetBy(dx: 1, dy: 1)
    return childFrames.map { interior.intersects($0 ?? .zero) }
}
