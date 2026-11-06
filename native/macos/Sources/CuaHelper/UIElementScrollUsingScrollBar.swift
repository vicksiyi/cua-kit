// Reconstructed control flow of 0x1007287d0..<0x1007289b0.
// Generic values expose the not-yet-restored ScrollBarUIElement / protocol
// getters without substituting direct AXValue writes or coordinate scrolling.
func uiElementScrollUsingScrollBar<ScrollBar, Button>(
    direction: UIElementScrollDirection,
    verticalScrollBar: () -> ScrollBar?,
    horizontalScrollBar: () -> ScrollBar?,
    decrementPageButton: (ScrollBar) -> Button?,
    incrementPageButton: (ScrollBar) -> Button?,
    perform: (Button, UIElementAction) throws -> Void
) throws -> Bool {
    let bar: ScrollBar?
    switch direction {
    case .up, .down: bar = verticalScrollBar()
    case .left, .right: bar = horizontalScrollBar()
    }
    guard let bar else { return false }
    let button: Button?
    switch direction {
    case .up, .left: button = decrementPageButton(bar)
    case .down, .right: button = incrementPageButton(bar)
    }
    guard let button else { return false }
    try perform(button, .press)
    return true
}
