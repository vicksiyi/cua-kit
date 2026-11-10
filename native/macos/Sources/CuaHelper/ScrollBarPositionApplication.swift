import CoreGraphics

// Native0x1007a3308 calls Swift.max(value,lower) followed by
// Swift.min(intermediate,upper). Preserve argument order for unordered values.
func clampScrollBarPosition(_ value: CGFloat) -> CGFloat {
    min(max(value, 0), 1)
}

// Per-axis calculation/write portion of scrollToVisible(frame:). Scrollbar
// selection and enabled checks surround this stage in the native frame helper.
// Content geometry and current value are read only for an overflowing axis;
// the range guard occurs after these reads, matching the original call order.
func applyScrollBarPosition(targetMin: CGFloat, targetMax: CGFloat,
    viewportMin: CGFloat, viewportMax: CGFloat, viewportSize: CGFloat,
    contentGeometry: () -> (min: CGFloat, size: CGFloat),
    currentValue: () -> CGFloat?, write: (CGFloat) throws -> Void
) throws -> Bool {
    guard targetMin < viewportMin || viewportMax < targetMax else { return false }
    let content = contentGeometry()
    let value = currentValue()
    guard let position = scrollBarPositionForVisibleTarget(targetMin: targetMin, targetMax: targetMax,
        viewportMin: viewportMin, viewportMax: viewportMax, viewportSize: viewportSize,
        contentMin: content.min, contentSize: content.size, currentValue: value) else { return false }
    try write(clampScrollBarPosition(position))
    return true
}
