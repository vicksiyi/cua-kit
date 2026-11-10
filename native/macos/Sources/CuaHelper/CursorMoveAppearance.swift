import AppKit
import GraphicsSupport

extension ComputerUseCursor {
    // Move prefix 0x100092134..0x100092224 (also the post-delegate resume).
    // Return the original visibility snapshot used later in move(). This does
    // not order a window, move it, or claim the remaining move is implemented.
    func prepareMoveAppearance(animated: Bool, fadeIn: Bool) -> Bool {
        let wasVisible = window.isVisible
        if !wasVisible && (animated || fadeIn) {
            let currentWindow = window
            currentWindow.alphaValue = 0
            currentWindow.contentViewController?.view.layer?.updateFilter(
                LayerFilter.GaussianBlur(radius: 7, hardEdges: nil, normalizeEdges: nil),
                creatingIfNeeded: true)
        }
        return wasVisible
    }
}
