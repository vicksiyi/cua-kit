// Native descriptor0x1012c9848 / fields0x101321578: difference, changes,
// changesSortedDepthFirst. Changes are materialized once, not a lazy view.
struct UIElementRenderDifferenceBuffer<Identity: Hashable> {
    let difference: UIElementRenderDifference<Identity>
    var changes: [UIElementRenderDifference<Identity>.Change]
    var changesSortedDepthFirst: Bool
}

extension UIElementRenderDifference {
    //0x1006413c0..0x100641478 retains old/new render arrays, constructs
    // Array(self), and returns the buffer with the sorting flag false.
    func buffer() -> UIElementRenderDifferenceBuffer<Identity> {
        UIElementRenderDifferenceBuffer(difference: self, changes: Array(self), changesSortedDepthFirst: false)
    }
}
