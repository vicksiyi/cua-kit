import CoreGraphics

// Descriptor 0x1012ea668 / fields 0x101346878. JPEG payload's symbolic
// type is Optional<CGFloat> with tuple label compressionQuality.
public enum ScreenshotEncoding: Equatable {
    case jpeg(compressionQuality: CGFloat?)
    case png
}
