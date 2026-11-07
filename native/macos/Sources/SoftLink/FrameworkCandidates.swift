import Foundation

/// Static [String?] at 0x101558088, used by filesystem discovery.
let filesystemFrameworkVersions: [String?] = [nil, "Current", "A", "B", "C"]

/// 0x10024de70. Caller has already checked the .framework suffix.
func frameworkImageCandidates(directory: String, entry: String,
                              versions: [String?] = filesystemFrameworkVersions) -> [String] {
    let name = String(entry.dropLast(".framework".count))
    return versions.map { version in
        let base = directory + "/" + entry + "/"
        return base + (version.map { "Versions/" + $0 + "/" } ?? "") + name
    }
}

/// 0x10024e0e8: nested-framework directories, preserving supplied version order.
func nestedFrameworkDirectories(directory: String, entry: String,
                                versions: [String?] = filesystemFrameworkVersions) -> [String] {
    versions.map { version in
        directory + "/" + entry + "/" +
            (version.map { "Versions/" + $0 + "/" } ?? "") + "Frameworks"
    }
}

/// Public-framework branch 0x10024a330..<0x10024abdc. This is one level of
/// nested framework discovery, not an unbounded recursive filesystem search.
/// `hasPending` reads the current strategy-0 group after each callback.
func visitPublicFrameworkCandidates(
    contents: (String) throws -> [String] = { try FileManager.default.contentsOfDirectory(atPath: $0) },
    hasPending: () -> Bool,
    visit: (String) -> Void
) {
    guard hasPending() else { return }
    let root = "/System/Library/Frameworks"
    guard let entries = try? contents(root) else { return }
    for entry in entries where entry.hasSuffix(".framework") {
        for candidate in frameworkImageCandidates(directory: root, entry: entry) {
            visit(candidate)
            if !hasPending() { return }
        }
        for directory in nestedFrameworkDirectories(directory: root, entry: entry) {
            guard let children = try? contents(directory) else { continue }
            for child in children where child.hasSuffix(".framework") {
                for candidate in frameworkImageCandidates(directory: directory, entry: child) {
                    visit(candidate)
                    if !hasPending() { return }
                }
            }
        }
    }
}
