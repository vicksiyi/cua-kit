import CoreGraphics
import ScreenCaptureKit

// SC branch performs one capture, preserving SDK errors and returning the image
// without applying the separate WindowServer resize continuation.
public func captureScreenScreenshot<Configuration, Image>(
    configuration: () throws -> Configuration,
    capture: (Configuration) async throws -> Image
) async throws -> Image {
    let configuration = try configuration()
    return try await capture(configuration)
}

public func captureScreenScreenshot(filter: SCContentFilter, configuration: SCStreamConfiguration)
    async throws -> CGImage {
    try await captureScreenScreenshot(configuration: { configuration }, capture: {
        try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: $0)
    })
}
