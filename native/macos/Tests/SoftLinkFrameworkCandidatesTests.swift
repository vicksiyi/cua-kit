import MachO
import Darwin

@main struct Test {
    enum Missing: Error { case directory }
    static func main() {
        let root = "/System/Library/Frameworks"
        precondition(frameworkImageCandidates(directory: root, entry: "父.framework") == [
            root + "/父.framework/父", root + "/父.framework/Versions/Current/父",
            root + "/父.framework/Versions/A/父", root + "/父.framework/Versions/B/父",
            root + "/父.framework/Versions/C/父"])
        precondition(nestedFrameworkDirectories(directory: "/raw/", entry: "a.framework", versions: ["", nil, "X", nil]) == [
            "/raw//a.framework/Versions//Frameworks", "/raw//a.framework/Frameworks",
            "/raw//a.framework/Versions/X/Frameworks", "/raw//a.framework/Frameworks"])
        precondition(frameworkImageCandidates(directory: "", entry: ".framework", versions: [nil]) == ["/.framework/"])
        var listed: [String] = [], visited: [String] = []
        let inner = root + "/Parent.framework/Versions/A/Frameworks"
        func contents(_ directory: String) throws -> [String] {
            listed.append(directory)
            if directory == root { return ["skip.FRAMEWORK", "Parent.framework", "Later.framework"] }
            if directory == inner { return ["readme", "Child.framework"] }
            throw Missing.directory
        }
        visitPublicFrameworkCandidates(contents: contents, hasPending: { true }, visit: { visited.append($0) })
        precondition(visited == frameworkImageCandidates(directory: root, entry: "Parent.framework") +
            frameworkImageCandidates(directory: inner, entry: "Child.framework") +
            frameworkImageCandidates(directory: root, entry: "Later.framework"))
        precondition(listed == [root] + nestedFrameworkDirectories(directory: root, entry: "Parent.framework") +
            nestedFrameworkDirectories(directory: root, entry: "Later.framework"))
        // Feed discovery into the actual restored callback, with fake platform IO.
        let target = inner + "/Child.framework/Versions/B/Child", salt = "fixture"
        let hash = Array(target.utf8).withUnsafeBufferPointer { bytes in
            Array(salt.utf8).withUnsafeBufferPointer { sipHash(buffer: bytes, appending: $0) }
        } & imageHashMask
        var requests = filesystemImageRequests([hash])
        var found: [Int: UnsafePointer<mach_header>] = [:], opened: [String] = []
        let name = strdup(target)!
        defer { free(name) }
        let header = UnsafePointer<mach_header>(bitPattern: 0x1000)!
        let sources = FilesystemImageCandidateSources(open: { opened.append($0); return true },
            loaded: LoadedImages(count: { 1 }, header: { _ in header }, name: { _ in UnsafePointer(name) }))
        listed = []; visited = []
        visitPublicFrameworkCandidates(contents: contents,
            hasPending: { !(requests[.framework]?.isEmpty ?? true) }, visit: { candidate in
                visited.append(candidate)
                loadFilesystemImageCandidate(path: candidate, strategy: .framework, salt: salt,
                    images: [hash], requests: &requests, found: &found, sources: sources)
            })
        precondition(opened == [target] && found[0] == header && visited.last == target)
        precondition(listed.last == inner && listed.count == 4)
        listed = []; visited = []
        visitPublicFrameworkCandidates(contents: contents, hasPending: { false }, visit: { visited.append($0) })
        precondition(listed.isEmpty && visited.isEmpty)
        visitPublicFrameworkCandidates(contents: { _ in throw Missing.directory }, hasPending: { true },
            visit: { _ in preconditionFailure("failed root listing must not visit") })
        print("SoftLink framework discovery order, nested paths and callback integration passed")
    }
}
