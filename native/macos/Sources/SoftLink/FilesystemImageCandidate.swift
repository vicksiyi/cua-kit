import Darwin
import MachO

/// Dependency seams for the native candidate callback at 0x10024e36c.
struct FilesystemImageCandidateSources {
    var open: (String) -> Bool
    var loaded: LoadedImages

    static var system: Self {
        Self(open: { path in path.withCString { dlopen($0, RTLD_NOW) != nil } },
             loaded: .system)
    }
}

/// Match before loading; a successful dlopen consumes this strategy/hash even
/// if dyld cannot subsequently supply a matching header. Handles stay loaded.
func loadFilesystemImageCandidate(
    path: String, strategy: ImageSearchStrategy, salt: String, images: [UInt64],
    requests: inout [ImageSearchStrategy: [UInt64: [Int]]],
    found: inout [Int: UnsafePointer<mach_header>],
    sources: FilesystemImageCandidateSources
) {
    guard let group = requests[strategy] else { return }
    let suffix = Array(salt.utf8)
    let key = Array(path.utf8).withUnsafeBufferPointer { bytes in
        suffix.withUnsafeBufferPointer { sipHash(buffer: bytes, appending: $0) }
    } & imageHashMask
    guard let indices = group[key], sources.open(path) else { return }
    for index in indices where found[index] == nil {
        // The original enumerates dyld afresh for each unresolved request.
        let count = sources.loaded.count()
        let requested = images[index]
        suffix.withUnsafeBufferPointer { saltBytes in
            for loadedIndex in 0..<count {
                let header = sources.loaded.header(loadedIndex)
                guard let name = sources.loaded.name(loadedIndex) else { continue }
                if imagePath(name, matchesAnyOf: [requested], appending: saltBytes) {
                    found[index] = header
                    break
                }
            }
        }
    }
    requests[strategy]?.removeValue(forKey: key)
}

/// Native final assembly at 0x10024d5a0: request order, skipping absent entries.
func filesystemImageResults(count: Int, found: [Int: UnsafePointer<mach_header>]) -> [ResolvedImage] {
    (0..<count).compactMap { index in
        found[index].map { ResolvedImage(index: index, header: $0) }
    }
}
