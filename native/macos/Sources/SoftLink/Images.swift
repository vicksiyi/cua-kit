import MachO
import Darwin

/// Native constant at 0x10116b3d0: the upper byte is not part of image identity.
public let imageHashMask: UInt64 = 0x00ff_ffff_ffff_ffff

public struct ResolvedImage {
    /// Position in the requested image array, not the dyld image index.
    public let index: Int
    public let header: UnsafePointer<mach_header>
}

/// 0x100250cbc: hash the complete raw C-string path followed by suffix bytes.
/// No basename extraction, case folding, or filesystem normalization occurs.
public func imagePath(_ path: UnsafePointer<CChar>, matchesAnyOf images: [UInt64],
                      appending suffix: UnsafeBufferPointer<UInt8>) -> Bool {
    let bytes = UnsafeRawPointer(path).assumingMemoryBound(to: UInt8.self)
    let value = sipHash(bytes: bytes, count: strlen(path), appending: suffix)
    return images.contains { (($0 ^ value) & imageHashMask) == 0 }
}

/// Injection boundary for the three dyld reads observed in lookUpImages.
struct LoadedImages {
    var count: () -> UInt32
    var header: (UInt32) -> UnsafePointer<mach_header>?
    var name: (UInt32) -> UnsafePointer<CChar>?

    static var system: Self {
        Self(count: { _dyld_image_count() }, header: { _dyld_get_image_header($0) },
             name: { _dyld_get_image_name($0) })
    }
}

/// 0x1002496d8: first loaded image for each masked hash wins. Output follows
/// original request order, including duplicate requests with separate indices.
func lookUpImages(images: [UInt64], salt: String, loaded: LoadedImages) -> [ResolvedImage] {
    guard !images.isEmpty else { return [] }
    let requested = Set(images.map { $0 & imageHashMask })
    var found: [UInt64: UnsafePointer<mach_header>] = [:]
    let count = loaded.count()
    Array(salt.utf8).withUnsafeBufferPointer { suffix in
        for index in 0..<count {
            guard let header = loaded.header(index), let path = loaded.name(index) else { continue }
            let bytes = UnsafeRawPointer(path).assumingMemoryBound(to: UInt8.self)
            let key = sipHash(bytes: bytes, count: strlen(path), appending: suffix) & imageHashMask
            if requested.contains(key), found[key] == nil { found[key] = header }
        }
    }
    return images.enumerated().compactMap { index, hash in
        found[hash & imageHashMask].map { ResolvedImage(index: index, header: $0) }
    }
}

public func lookUpImages(images: [UInt64], salt: String) -> [ResolvedImage] {
    lookUpImages(images: images, salt: salt, loaded: .system)
}
