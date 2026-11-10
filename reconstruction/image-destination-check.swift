import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

@main struct Check {
    static func main() throws {
        precondition(ImageDestination.sessionFilenameCharacterCount == 6)
        precondition(ImageDestination.imageProperties(compressionQuality: nil) == nil)
        for (input, expected) in [(CGFloat(-1), CGFloat(0)), (-.infinity, 0), (-0.0, 0), (0.5, 0.5), (2, 1), (.infinity, 1)] {
            let properties = ImageDestination.imageProperties(compressionQuality: input)! as NSDictionary
            let value = properties[kCGImageDestinationLossyCompressionQuality] as! NSNumber
            precondition(value.doubleValue == Double(expected))
            if input == 0 { precondition(value.doubleValue.sign == .plus) }
        }
        let nan = ImageDestination.imageProperties(compressionQuality: .nan)! as NSDictionary
        precondition((nan[kCGImageDestinationLossyCompressionQuality] as! NSNumber).doubleValue.isNaN)
        precondition(ScreenshotEncoding.jpeg(compressionQuality: nil) == .jpeg(compressionQuality: nil))
        precondition(ScreenshotEncoding.png != .jpeg(compressionQuality: 1))
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
        defer { try? FileManager.default.removeItem(at: directory) }
        let context = CGContext(data: nil, width: 4, height: 3, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.setFillColor(CGColor(red: 1, green: 0, blue: 0, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: 4, height: 3))
        let image = context.makeImage()!
        for (type, quality) in [(UTType.png, nil), (.jpeg, CGFloat(0.8))] {
            let url = directory.appendingPathComponent(UUID().uuidString)
            let destination = try ImageDestination(url: url, forType: type)
            destination.add(image: image, compressionQuality: quality)
            precondition(destination.finalize())
            let stageURL = directory.appendingPathComponent(UUID().uuidString)
            let encoding: ScreenshotEncoding = type == .png ? .png : .jpeg(compressionQuality: quality)
            let mime = try ScreenshotImplementation.writeScreenshotImage(to: stageURL, screenshot: image, encoding: encoding)
            precondition(mime == (type == .png ? "image/png" : "image/jpeg"))
            precondition(CGImageSourceCreateWithURL(stageURL as CFURL, nil) != nil)
            let source = CGImageSourceCreateWithURL(url as CFURL, nil)!
            precondition(CGImageSourceGetCount(source) == 1)
            precondition(CGImageSourceGetType(source)! as String == type.identifier)
            let decoded = CGImageSourceCreateImageAtIndex(source, 0, nil)!
            precondition(decoded.width == 4 && decoded.height == 3)
        }
        precondition((ImageDestination.sourceProperties(maxPixelSize: nil) as NSDictionary).count == 0)
        for value in [-1, 0, 2, Int.max] {
            let properties = ImageDestination.sourceProperties(maxPixelSize: value) as NSDictionary
            precondition(properties.count == 1)
            precondition((properties[kCGImageDestinationImageMaxPixelSize] as! NSNumber).intValue == value)
        }
        let sourceURL = directory.appendingPathComponent("source.png")
        _ = try ScreenshotImplementation.writeScreenshotImage(to: sourceURL, screenshot: image, encoding: .png)
        let source = CGImageSourceCreateWithURL(sourceURL as CFURL, nil)!
        for maxPixelSize in [nil, 2, 10] as [Int?] {
            let url = directory.appendingPathComponent(UUID().uuidString)
            let destination = try ImageDestination(url: url, forType: .png)
            destination.addImage(from: source, at: 0, maxPixelSize: maxPixelSize)
            precondition(destination.finalize())
            let copied = CGImageSourceCreateWithURL(url as CFURL, nil)!
            let decoded = CGImageSourceCreateImageAtIndex(copied, 0, nil)!
            if maxPixelSize == 2 { precondition(max(decoded.width, decoded.height) == 2) }
            else { precondition(decoded.width == 4 && decoded.height == 3) }
        }
        do {
            _ = try ImageDestination(url: directory.appendingPathComponent("invalid"), forType: .plainText)
            preconditionFailure("Unsupported image type must fail")
        } catch ImageDestination.Error.failedToCreateImageDestination { }
        print("Image destination checks passed")
    }
}
