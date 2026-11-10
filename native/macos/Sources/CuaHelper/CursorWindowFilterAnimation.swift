import AppKit
import GraphicsSupport
import QuartzCore

extension ComputerUseCursorWindow {
    // Native 0x100095580: remove every GaussianBlur, preserving other typed
    // filters in order, and write back even when none was present.
    func resetBlurFilters() {
        guard let layer = contentViewController?.view.layer else { return }
        var filters = layer.layerFilters
        filters.removeAll { $0 is LayerFilter.GaussianBlur }
        layer.layerFilters = filters
    }

    // Native 0x100095858. The model filter is installed separately before the
    // explicit transition animation; this does not create a missing layer.
    func animateBlurTransition(from initialRadius: CGFloat, to targetRadius: CGFloat) {
        guard let layer = contentViewController?.view.layer else { return }
        let animation = CABasicAnimation(keyPath: "filters.gaussianBlur.inputRadius")
        animation.fromValue = initialRadius
        animation.toValue = targetRadius
        animation.duration = 0.44
        animation.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        layer.add(animation, forKey: "cursorBlurTransition")
    }

    // Native 0x100096870, used by the NSAnimationContext hide closure.
    func animateAlphaValue(_ value: CGFloat, context: NSAnimationContext) {
        context.duration = 0.44
        context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        animator().alphaValue = value
    }
}
