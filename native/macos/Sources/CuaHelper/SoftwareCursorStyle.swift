import AppKit

// Recovered makeView portion of SoftwareCursorStyle (0x10009bf40).
// Full native Style state/animation inheritance is still being recovered.
@MainActor
final class SoftwareCursorStyle {
    private var view: NSImageView?
    func makeView() -> NSView {
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
