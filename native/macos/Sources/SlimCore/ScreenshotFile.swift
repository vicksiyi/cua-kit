import Foundation

// 100fb29f4..100fb2b20 and 1012ea684/1013468a0: three stored fields.
// Native derives fieldwise Hashable and keyed Codable, retaining File ownership.
public struct ScreenshotFile: Hashable, Codable {
    public let file: File
    public let url: URL
    public let mimeType: String

    public init(file: File, url: URL, mimeType: String) {
        self.file = file; self.url = url; self.mimeType = mimeType
    }
}
