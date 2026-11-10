#if canImport(SlimCore)
import SlimCore
#endif
import CoreGraphics

extension ScreenshotImplementation {
    // Extracted async stages, fb36f8..fb381c: capture failure skips writing;
    // successful capture is encoded as PNG, returning only the retained File.
    static func captureScreenshotFileResult(
        capture: () async throws -> CGImage,
        write: (CGImage, ScreenshotEncoding) throws -> ScreenshotFile
    ) async throws -> File {
        let image = try await capture()
        return try write(image, .png).file
    }
}
