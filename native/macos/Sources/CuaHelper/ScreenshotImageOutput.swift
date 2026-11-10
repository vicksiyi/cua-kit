import Foundation
import CoreGraphics
import UniformTypeIdentifiers

extension ScreenshotImplementation {
    // Extracted image-output stage of writeScreenshotToFile, fb4024..fb42d0.
    // Filename/path ownership and returned ScreenshotFile are separate layers.
    // The source ignores finalize's Bool; do not fabricate a new throw here.
    static func writeScreenshotImage(to url: URL, screenshot: CGImage,
        encoding: ScreenshotEncoding
    ) throws -> String {
        let type: UTType
        let quality: CGFloat?
        let mimeType: String
        switch encoding {
        case .jpeg(let compressionQuality):
            type = .jpeg; quality = compressionQuality; mimeType = "image/jpeg"
        case .png:
            type = .png; quality = nil; mimeType = "image/png"
        }
        let destination = try ImageDestination(url: url, forType: type)
        destination.add(image: screenshot, compressionQuality: quality)
        _ = destination.finalize()
        return mimeType
    }
}
