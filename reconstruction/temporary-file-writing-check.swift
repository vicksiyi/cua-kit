import Foundation
import System

@main struct Check {
    enum Failure: Swift.Error { case writer }
    static func main() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try fm.createDirectory(at: root, withIntermediateDirectories: false)
        defer { try? fm.removeItem(at: root) }
        let base = FilePath(root.path)
        let named = TemporaryFile.initialTemporaryDirectory(base: base, bundleIdentifier: "fixture.app")
        precondition(named == base.appending("fixture.app"))
        precondition(fm.fileExists(atPath: named.string))
        let unknown = TemporaryFile.initialTemporaryDirectory(base: base, bundleIdentifier: nil)
        precondition(unknown == base.appending("inc.software.unknown"))
        // An empty identifier is present, not the nil fallback.
        precondition(TemporaryFile.initialTemporaryDirectory(base: base, bundleIdentifier: "") == base.appending(""))
        let blocked = base.appending("regular-file")
        try Data().write(to: URL(fileURLWithPath: blocked.string))
        precondition(TemporaryFile.initialTemporaryDirectory(base: blocked, bundleIdentifier: "child") == blocked)

        let previous = TemporaryFile.temporaryDirectory
        TemporaryFile.temporaryDirectory = named
        defer { TemporaryFile.temporaryDirectory = previous }
        var observed: FilePath?
        var owner: TemporaryFile? = try TemporaryFile(writingNewFile: "shot") { path in
            observed = path
            precondition(!fm.fileExists(atPath: path.string))
            try Data("image".utf8).write(to: URL(fileURLWithPath: path.string))
        }
        precondition(owner?.path == observed)
        precondition(fm.fileExists(atPath: observed!.string))
        owner = nil
        precondition(!fm.fileExists(atPath: observed!.string))
        do {
            _ = try TemporaryFile(writingNewFile: "missing") { _ in }
            preconditionFailure("missing output accepted")
        } catch TemporaryFile.Error.fileDidNotExistAfterCallingWriteBlock {}
        var partial: FilePath?
        do {
            _ = try TemporaryFile(writingNewFile: "partial") { path in
                partial = path
                try Data().write(to: URL(fileURLWithPath: path.string))
                throw Failure.writer
            }
            preconditionFailure("writer error lost")
        } catch Failure.writer {}
        precondition(fm.fileExists(atPath: partial!.string))
        // Native checks existence, not regular-file type.
        var directory: TemporaryFile? = try TemporaryFile(writingNewFile: "directory") { path in
            try fm.createDirectory(atPath: path.string, withIntermediateDirectories: false)
        }
        let directoryPath = directory!.path
        directory = nil
        precondition(!fm.fileExists(atPath: directoryPath.string))
        print("Temporary file initialization and writing checks passed")
    }
}
