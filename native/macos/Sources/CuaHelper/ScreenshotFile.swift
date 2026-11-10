import Foundation

// 100fb29f4..100fb2b20 and 1012ea684/1013468a0: three stored fields.
// Native derives fieldwise Hashable and keyed Codable, retaining File ownership.
struct ScreenshotFile: Hashable, Codable {
    let file: File
    let url: URL
    let mimeType: String
}
