import Foundation
import CoreGraphics
import ImageIO
import System
import UniformTypeIdentifiers

@main struct Check {
    static func main() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try fm.createDirectory(at: root, withIntermediateDirectories: false)
        defer { try? fm.removeItem(at: root) }
        let previous = TemporaryFile.temporaryDirectory
        TemporaryFile.temporaryDirectory = FilePath(root.path)
        defer { TemporaryFile.temporaryDirectory = previous }
        let context = CGContext(data: nil, width: 4, height: 3, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        let image = context.makeImage()!
        let date = Date(timeIntervalSince1970: 1_700_000_000)
        for (encoding, type, mime) in [(ScreenshotEncoding.png, UTType.png, "image/png"),
            (.jpeg(compressionQuality: 0.8), .jpeg, "image/jpeg")] {
            var shot: ScreenshotFile? = try ScreenshotImplementation.writeScreenshotToFile(
                appName: "Test/App", screenshot: image, encoding: encoding, date: date)
            let url = shot!.url
            let name = File.filename("Test/App Screenshot", reservedUTF16Count: 6, date: date, type: type)
            precondition(url.lastPathComponent == name && shot!.mimeType == mime)
            guard case .temporaryFile = shot!.file else { preconditionFailure("wrong ownership representation") }
            let source = CGImageSourceCreateWithURL(url as CFURL, nil)!
            precondition(CGImageSourceGetType(source) as String? == type.identifier)
            let decoded = CGImageSourceCreateImageAtIndex(source, 0, nil)!
            precondition(decoded.width == 4 && decoded.height == 3)
            var collision: ScreenshotFile? = try ScreenshotImplementation.writeScreenshotToFile(
                appName: "Test/App", screenshot: image, encoding: encoding, date: date)
            let collisionURL = collision!.url
            precondition(collisionURL.deletingLastPathComponent().lastPathComponent == "1")
            precondition(collisionURL.lastPathComponent == name)
            precondition(collision!.mimeType == mime)
            shot = nil
            collision = nil
            precondition(!fm.fileExists(atPath: url.path) && !fm.fileExists(atPath: collisionURL.path))
        }
        var unnamed: ScreenshotFile? = try ScreenshotImplementation.writeScreenshotToFile(
            appName: nil, screenshot: image, encoding: .png, date: date)
        precondition(unnamed!.url.lastPathComponent.hasPrefix("Screenshot "))
        let unnamedURL = unnamed!.url
        unnamed = nil
        precondition(!fm.fileExists(atPath: unnamedURL.path))
        print("Screenshot file naming, encoding and ownership checks passed")
    }
}
