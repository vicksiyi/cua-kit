/// Native enum field order at descriptor 0x1012c19e0 (four no-payload cases).
enum ImageSearchStrategy: UInt8 {
    case framework = 0
    case privateFramework = 1
    case library = 2
    case path = 3
}

/// Extracted request preparation from loadImagesFromFilesystem,
/// 0x100249ff8..<0x10024a330. The high byte carries a strategy, not identity.
/// Unknown strategies are ignored only by filesystem loading; loaded-image
/// matching independently ignores all high-byte values.
func filesystemImageRequests(_ images: [UInt64]) -> [ImageSearchStrategy: [UInt64: [Int]]] {
    var grouped: [ImageSearchStrategy: [UInt64: [Int]]] = [:]
    for (index, image) in images.enumerated() {
        guard let strategy = ImageSearchStrategy(rawValue: UInt8(image >> 56)) else { continue }
        grouped[strategy, default: [:]][image & imageHashMask, default: []].append(index)
    }
    return grouped
}
