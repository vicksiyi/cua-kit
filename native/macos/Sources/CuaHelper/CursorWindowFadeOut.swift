import AppKit
import GraphicsSupport

extension ComputerUseCursorWindow {
    // Native fadeOut() 0x100095a6c: a checked continuation waits for the
    // NSAnimationContext completion. No detached task or sleep approximation.
    func fadeOut() async {
        await withCheckedContinuation { continuation in
            contentViewController?.view.layer?.updateFilter(
                LayerFilter.GaussianBlur(radius: 7, hardEdges: nil, normalizeEdges: nil),
                creatingIfNeeded: true)
            animateBlurTransition(from: 0, to: 7)
            NSAnimationContext.runAnimationGroup { context in
                self.animateAlphaValue(0, context: context)
            } completionHandler: {
                // Preserve original order: hide, restore alpha, remove blur,
                // then resume the awaiting owner.
                self.orderOut(nil)
                self.alphaValue = 1
                self.resetBlurFilters()
                continuation.resume()
            }
        }
    }
}
