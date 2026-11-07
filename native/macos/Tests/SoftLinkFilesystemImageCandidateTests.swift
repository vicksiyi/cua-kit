import MachO
import Darwin

@main struct Test {
    static func main() {
        let path = "/fixture/图像", salt = "salt\0后"
        let hash = Array(path.utf8).withUnsafeBufferPointer { bytes in
            Array(salt.utf8).withUnsafeBufferPointer { sipHash(buffer: bytes, appending: $0) }
        } & imageHashMask
        let images = [hash, hash, hash | (1 << 56)]
        let header = UnsafePointer<mach_header>(bitPattern: 0x1000)!
        let previous = UnsafePointer<mach_header>(bitPattern: 0x2000)!
        let name = strdup(path)!
        defer { free(name) }
        var opens = 0, scans = 0, succeeds = false
        var requests = filesystemImageRequests(images)
        var found: [Int: UnsafePointer<mach_header>] = [0: previous]
        let sources = FilesystemImageCandidateSources(open: { candidate in
            precondition(candidate == path); opens += 1; return succeeds
        }, loaded: LoadedImages(count: { scans += 1; return 1 },
                                header: { _ in header }, name: { _ in UnsafePointer(name) }))
        func load(_ candidate: String = path, _ strategy: ImageSearchStrategy = .framework) {
            loadFilesystemImageCandidate(path: candidate, strategy: strategy, salt: salt,
                images: images, requests: &requests, found: &found, sources: sources)
        }
        load("unrequested")
        load(path, .library)
        precondition(opens == 0 && scans == 0)
        load()
        precondition(opens == 1 && scans == 0 && requests[.framework]?[hash] == [0, 1])
        succeeds = true
        load()
        precondition(opens == 2 && scans == 1 && found[0] == previous && found[1] == header)
        precondition(requests[.framework]?.isEmpty == true && requests[.privateFramework]?[hash] == [2])
        load()
        precondition(opens == 2)
        load(path, .privateFramework)
        precondition(scans == 2 && found[2] == header)
        let result = filesystemImageResults(count: 4, found: found)
        precondition(result.map(\.index) == [0, 1, 2] && result[0].header == previous)

        // Successful dlopen does not guarantee discovery. A matching nil header
        // stops the scan; a later matching nonnil header is not substituted.
        requests = filesystemImageRequests([hash]); found = [:]
        var visited: [UInt32] = []
        let nilFirst = FilesystemImageCandidateSources(open: { _ in true },
            loaded: LoadedImages(count: { 2 }, header: { index in
                visited.append(index); return index == 0 ? nil : header
            }, name: { _ in UnsafePointer(name) }))
        loadFilesystemImageCandidate(path: path, strategy: .framework, salt: salt,
            images: [hash], requests: &requests, found: &found, sources: nilFirst)
        precondition(visited == [0] && found.isEmpty && requests[.framework]?.isEmpty == true)
        precondition(filesystemImageResults(count: 0, found: found).isEmpty)
        print("SoftLink filesystem candidate loading and result ordering passed")
    }
}
