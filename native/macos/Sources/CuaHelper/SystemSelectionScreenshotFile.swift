#if canImport(SlimCore)
import SlimCore
#endif
import CoreGraphics

extension SystemSelection {
    // 1002350a4..100235160: use AX application title, not window title,
    // bundle display name or nil. Missing title is an explicit Unknown name.
    static func writeScreenshotToFile(_ screenshot: CGImage,
        for context: FocusedUIElementContext, encoding: ScreenshotEncoding
    ) throws -> ScreenshotFile {
        try ScreenshotImplementation.writeScreenshotToFile(appName: context.app.title ?? "Unknown",
            screenshot: screenshot, encoding: encoding)
    }
}
