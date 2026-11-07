import Foundation
import MachO

/// Platform seams; enumeration preserves FileManager's returned order.
struct FilesystemImageSources {
    var contents: (String) throws -> [String]
    var candidate: FilesystemImageCandidateSources

    static var system: Self {
        Self(contents: { try FileManager.default.contentsOfDirectory(atPath: $0) },
             candidate: .system)
    }
}

/// 0x100249eb4..<0x10024b84c. The native implementation groups path-strategy
/// requests but does not enumerate any paths for that strategy.
func loadImagesFromFilesystem(images: [UInt64], salt: String,
                              sources: FilesystemImageSources) -> [ResolvedImage] {
    guard !images.isEmpty else { return [] }
    var requests = filesystemImageRequests(images)
    var found: [Int: UnsafePointer<mach_header>] = [:]
    func pending(_ strategy: ImageSearchStrategy) -> Bool {
        !(requests[strategy]?.isEmpty ?? true)
    }
    func visit(_ path: String, _ strategy: ImageSearchStrategy) {
        loadFilesystemImageCandidate(path: path, strategy: strategy, salt: salt,
            images: images, requests: &requests, found: &found, sources: sources.candidate)
    }
    for (strategy, root) in [(ImageSearchStrategy.framework, "/System/Library/Frameworks"),
                              (.privateFramework, "/System/Library/PrivateFrameworks")] {
        visitFrameworkCandidates(root: root, contents: sources.contents,
                                 hasPending: { pending(strategy) }, visit: { visit($0, strategy) })
    }
    if pending(.library) {
        for directory in ["/usr/lib", "/usr/lib/system"] {
            if let entries = try? sources.contents(directory) {
                for entry in entries where entry.hasSuffix(".dylib") || entry.hasSuffix(".so") {
                    visit(directory + "/" + entry, .library)
                    if !pending(.library) { break }
                }
            }
            if !pending(.library) { break }
        }
    }
    return filesystemImageResults(count: images.count, found: found)
}

public func loadImagesFromFilesystem(images: [UInt64], salt: String) -> [ResolvedImage] {
    loadImagesFromFilesystem(images: images, salt: salt, sources: .system)
}
