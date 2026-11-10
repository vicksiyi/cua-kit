import Foundation
import CoreGraphics
import UniformTypeIdentifiers

extension ScreenshotImplementation {
    // Functional writer composition from fb3d5c..fb4500. Original logging and
    // signpost instrumentation remain a separate pending wrapper.
    static func writeScreenshotToFile(appName: String?, screenshot: CGImage,
        encoding: ScreenshotEncoding
    ) throws -> ScreenshotFile {
        try writeScreenshotToFile(appName: appName, screenshot: screenshot, encoding: encoding, date: .now)
    }

    // Date is the extracted Foundation environment boundary for deterministic tests.
    static func writeScreenshotToFile(appName: String?, screenshot: CGImage,
        encoding: ScreenshotEncoding, date: Date
    ) throws -> ScreenshotFile {
        let type: UTType
        switch encoding {
        case .jpeg: type = .jpeg
        case .png: type = .png
        }
        let name = appName.map { $0 + " Screenshot" } ?? "Screenshot"
        let filename = File.filename(name, reservedUTF16Count: 6, date: date, type: type)
        let path = TemporaryFile.uniquePath(forFilename: filename, in: TemporaryFile.temporaryDirectory)
        let url = URL(filePath: path.string, directoryHint: .notDirectory, relativeTo: nil)
        let mime = try writeScreenshotImage(to: url, screenshot: screenshot, encoding: encoding)
        // Source allocates the owner AFTER finalize; it does not use writingNewFile
        // or perform that constructor's existence check, nor check finalize's Bool.
        let owner = TemporaryFile(adoptingFileAt: path)
        return ScreenshotFile(file: File(owner), url: url, mimeType: mime)
    }
}
