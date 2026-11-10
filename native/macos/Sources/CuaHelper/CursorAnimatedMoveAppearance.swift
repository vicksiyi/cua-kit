import GraphicsSupport

extension ComputerUseCursorWindow {
    // Native0x100094eb4..0x100094f64 before motion startup. No await or
    // NSAnimationContext completion barrier exists in this stage.
    func prepareAnimatedMoveAppearance(wasVisible: Bool) {
        guard !wasVisible else { return }
        alphaValue = 1
        guard let layer = contentViewController?.view.layer else { return }
        layer.updateFilter(LayerFilter.GaussianBlur(radius: 0, hardEdges: nil, normalizeEdges: nil),
            creatingIfNeeded: true)
    }
}
