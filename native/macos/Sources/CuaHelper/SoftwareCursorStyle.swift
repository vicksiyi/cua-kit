import AppKit

// Recovered makeView portion of SoftwareCursorStyle (0x10009bf40).
// Native Style storage is shared; motion and window ownership remain separate.
@MainActor
final class SoftwareCursorStyle: ComputerUseCursorStyle {
    private var view: NSImageView?
    override var hotSpot: CGPoint { CGPoint(x: 4, y: 4) }
    override func makeView() -> NSView {
        if let view { return view }
        let imageView = NSImageView()
        let image = Bundle.module.url(forResource: "SoftwareCursor", withExtension: "png")
            .flatMap { NSImage(contentsOf: $0) } ?? NSImage()
        image.size = NSSize(width: 20, height: 23)
        imageView.image = image
        imageView.frame = NSRect(origin: .zero, size: image.size)
        view = imageView
        return imageView
    }
}
