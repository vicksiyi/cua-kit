import AppKit
import GraphicsSupport

// Exercise the actual animation completion on an owned, never-ordered window.
@MainActor
func runCursorWindowFadeOwnedCheck() async -> [String: Any] {
    fputs("Owned fade check: constructing hidden window\n", stderr)
    NSApplication.shared.setActivationPolicy(.prohibited)
    let window = ComputerUseCursorWindow(style: SoftwareCursorStyle(),
        motionConfiguration: .live)
    let layer = window.contentViewController!.view.layer!
    layer.layerFilters = [LayerFilter.ColorSaturate(amount: 0.75)]
    precondition(!window.isVisible)
    fputs("Owned fade check: awaiting first completion\n", stderr)
    await window.fadeOut()
    fputs("Owned fade check: first completion returned\n", stderr)
    precondition(!window.isVisible && window.alphaValue == 1)
    precondition(layer.layerFilters.map(\.name) == [.colorSaturate])
    precondition((layer.layerFilters[0] as? LayerFilter.ColorSaturate)?.amount == 0.75)
    // Missing content layer must still complete alpha cleanup and continuation.
    window.contentViewController = nil
    fputs("Owned fade check: awaiting missing-layer completion\n", stderr)
    await window.fadeOut()
    precondition(!window.isVisible && window.alphaValue == 1)
    return ["ownedHiddenWindowFadeCompleted": true, "missingLayerCompleted": true,
        "orderedWindows": false, "sentInput": false, "visibleAnimationVerified": false]
}
