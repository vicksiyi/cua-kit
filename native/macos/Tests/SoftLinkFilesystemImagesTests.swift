import Darwin
import MachO

@main struct Test {
    enum Missing: Error { case directory }
    static func main() {
        let salt = "whole-loader"
        func encoded(_ path: String, _ strategy: UInt64) -> UInt64 {
            let hash = Array(path.utf8).withUnsafeBufferPointer { bytes in
                Array(salt.utf8).withUnsafeBufferPointer { sipHash(buffer: bytes, appending: $0) }
            }
            return (hash & imageHashMask) | strategy << 56
        }
        let publicPath = "/System/Library/Frameworks/P.framework/P"
        let privateRoot = "/System/Library/PrivateFrameworks"
        let nested = privateRoot + "/Q.framework/Versions/Current/Frameworks"
        let privatePath = nested + "/R.framework/Versions/A/R"
        let libraryPath = "/usr/lib/system/libfixture.so"
        let paths = [publicPath, privatePath, libraryPath]
        let names = paths.map { strdup($0)! }
        defer { names.forEach { free($0) } }
        let headers = [0x1000, 0x2000, 0x3000].map { UnsafePointer<mach_header>(bitPattern: $0)! }
        var listed: [String] = [], opened: [String] = []
        let sources = FilesystemImageSources(contents: { directory in
            listed.append(directory)
            switch directory {
            case "/System/Library/Frameworks": return ["P.framework"]
            case privateRoot: return ["Q.framework"]
            case nested: return ["R.framework"]
            case "/usr/lib": throw Missing.directory
            case "/usr/lib/system": return ["ignored.SO", "ignored.txt", "libfixture.so", "later.dylib"]
            default: throw Missing.directory
            }
        }, candidate: FilesystemImageCandidateSources(open: { opened.append($0); return true },
            loaded: LoadedImages(count: { 3 }, header: { headers[Int($0)] }, name: { UnsafePointer(names[Int($0)]) })))
        // Traversal order differs from output order, and duplicate indices survive.
        let requests = [encoded(libraryPath, 2), encoded(privatePath, 1), encoded(publicPath, 0),
                        encoded(libraryPath, 2), encoded(publicPath, 3), encoded(publicPath, 255)]
        let result = loadImagesFromFilesystem(images: requests, salt: salt, sources: sources)
        precondition(result.map(\.index) == [0, 1, 2, 3])
        precondition(result.map(\.header) == [headers[2], headers[1], headers[0], headers[2]])
        precondition(opened == paths)
        precondition(listed == ["/System/Library/Frameworks", privateRoot,
            privateRoot + "/Q.framework/Frameworks", nested, "/usr/lib", "/usr/lib/system"])
        listed = []; opened = []
        for images in [[], [encoded(publicPath, 3)], [encoded(publicPath, 255)]] {
            precondition(loadImagesFromFilesystem(images: images, salt: salt, sources: sources).isEmpty)
        }
        precondition(listed.isEmpty && opened.isEmpty)
        // Exact suffix filtering and directory order; no recursive library scan.
        let dylib = "/usr/lib/plain.dylib"
        let rejection = FilesystemImageSources(contents: { directory in
            listed.append(directory)
            return ["plain.dylib", "plain.so.1", "plain.DYLIB", "subdir"]
        }, candidate: FilesystemImageCandidateSources(open: { opened.append($0); return false },
            loaded: LoadedImages(count: { preconditionFailure("failed open must not scan dyld") },
                                 header: { _ in nil }, name: { _ in nil })))
        precondition(loadImagesFromFilesystem(images: [encoded(dylib, 2)], salt: salt, sources: rejection).isEmpty)
        precondition(listed == ["/usr/lib", "/usr/lib/system"] && opened == [dylib])
        print("SoftLink full filesystem loading branch order and strategy isolation passed")
    }
}
