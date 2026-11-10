import AppKit
import GraphicsSupport

extension ComputerUseCursorWindow {
    // Native fadeIn()0x1000960f4, continuation body0x1000965d0.
    // Window association/ordering is performed by move(), not by this method.
    func fadeIn() async {
        await withCheckedContinuation { continuation in
            prepareFadeIn()
            NSAnimationContext.runAnimationGroup { context in
                self.animateAlphaValue(1, context: context)
            } completionHandler: {
                self.completeFadeIn { continuation.resume() }
            }
        }
    }

    // Model blur is already zero while the explicit presentation animation
    // transitions from7 to0. Unlike fadeOut, do not hide or restore alpha here.
    func prepareFadeIn() {
        alphaValue = 0
        contentViewController?.view.layer?.updateFilter(
            LayerFilter.GaussianBlur(radius: 0, hardEdges: nil, normalizeEdges: nil),
            creatingIfNeeded: true)
        animateBlurTransition(from: 7, to: 0)
    }

    // Completion thunk0x10009e1f8: remove blur before resuming the caller.
    func completeFadeIn(_ resume: () -> Void) {
        resetBlurFilters()
        resume()
    }
}
