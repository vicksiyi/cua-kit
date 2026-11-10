import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// Native value wrapper (metadata kind 0x200), not an independent image encoder.
public struct ImageDestination {
    public enum Error: Swift.Error, Hashable {
        case failedToCreateImageDestination
    }
    public static let sessionFilenameCharacterCount = 6
    let destination: CGImageDestination

    public init(url: URL, forType type: UTType) throws {
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL,
            type.identifier as CFString, 1, nil) else {
            throw Error.failedToCreateImageDestination
        }
        self.destination = destination
    }

    // Native comparisons 10101a030..10101a044 retain NaN, normalize -0 to +0,
    // and clamp infinities. A missing quality supplies nil properties, not [:].
    static func imageProperties(compressionQuality: CGFloat?) -> CFDictionary? {
        guard var quality = compressionQuality else { return nil }
        if quality <= 0 { quality = 0 }
        if quality > 1 { quality = 1 }
        return [kCGImageDestinationLossyCompressionQuality: NSNumber(value: Double(quality))] as CFDictionary
    }

    public func add(image: CGImage, compressionQuality: CGFloat?) {
        CGImageDestinationAddImage(destination, image,
            Self.imageProperties(compressionQuality: compressionQuality))
    }
    // Unlike add(image:), this source path bridges an empty dictionary for nil.
    // 10101a190..10101a258 forwards present Int values and index unchanged.
    static func sourceProperties(maxPixelSize: Int?) -> CFDictionary {
        guard let maxPixelSize else { return [:] as CFDictionary }
        return [kCGImageDestinationImageMaxPixelSize: NSNumber(value: maxPixelSize)] as CFDictionary
    }
    public func addImage(from source: CGImageSource, at index: Int, maxPixelSize: Int?) {
        CGImageDestinationAddImageFromSource(destination, source, index,
            Self.sourceProperties(maxPixelSize: maxPixelSize))
    }
    public func finalize() -> Bool { CGImageDestinationFinalize(destination) }
}
