import Foundation
import System
import Darwin

@main struct Check {
    static func main() throws {
        let manager = FileManager.default
        let rootURL = manager.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try manager.createDirectory(at: rootURL, withIntermediateDirectories: false)
        defer { try? manager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: rootURL.path); try? manager.removeItem(at: rootURL) }
        let root = FilePath(rootURL.path)
        func touch(_ path: FilePath) throws { try Data("fixture".utf8).write(to: URL(fileURLWithPath: path.string)) }
        let first = TemporaryFile.uniquePath(forFilename: "shot.png", in: root)
        precondition(first == root.appending("shot.png"))
        precondition(!manager.fileExists(atPath: first.string))
        try touch(first)
        let second = TemporaryFile.uniquePath(forFilename: "shot.png", in: root)
        precondition(second == root.appending("1/shot.png"))
        var isDirectory: ObjCBool = false
        precondition(manager.fileExists(atPath: root.appending("1").string, isDirectory: &isDirectory) && isDirectory.boolValue)
        try touch(second)
        // A regular file occupying the next numeric directory is replaced.
        try touch(root.appending("2"))
        let third = TemporaryFile.uniquePath(forFilename: "shot.png", in: root)
        precondition(third == root.appending("2/shot.png"))
        precondition(manager.fileExists(atPath: root.appending("2").string, isDirectory: &isDirectory) && isDirectory.boolValue)
        precondition(!manager.fileExists(atPath: third.string))
        // Selection doesn't reserve a file: repeat without writing chooses it again.
        precondition(TemporaryFile.uniquePath(forFilename: "shot.png", in: root) == third)
        // No initial collision means no preparation of even a nonexistent directory.
        let missing = root.appending("absent")
        precondition(TemporaryFile.uniquePath(forFilename: "file", in: missing) == missing.appending("file"))
        precondition(!manager.fileExists(atPath: missing.string))
        // Failure to prepare a collision directory is swallowed, not a fake success.
        if getuid() != 0 {
            let restricted = root.appending("restricted")
            try manager.createDirectory(atPath: restricted.string, withIntermediateDirectories: false)
            defer { try? manager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: restricted.string) }
            try touch(restricted.appending("file"))
            try manager.setAttributes([.posixPermissions: 0o500], ofItemAtPath: restricted.string)
            let failed = TemporaryFile.uniquePath(forFilename: "file", in: restricted)
            precondition(failed == restricted.appending("1/file"))
            precondition(!manager.fileExists(atPath: restricted.appending("1").string))
        }
        print("Temporary file unique path checks passed")
    }
}
