import Foundation
import System

@main struct Check {
    static func main() throws {
        let manager = FileManager.default
        let root = manager.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try manager.createDirectory(at: root, withIntermediateDirectories: false)
        defer { try? manager.removeItem(at: root) }
        let url = root.appendingPathComponent("owned")
        try Data("fixture".utf8).write(to: url)
        var owner: TemporaryFile? = TemporaryFile(adoptingFileAt: FilePath(url.path))
        weak var weakOwner = owner
        var alias = owner
        precondition(owner!.path.string == url.path)
        owner = nil
        precondition(weakOwner != nil && manager.fileExists(atPath: url.path))
        withExtendedLifetime(alias) { precondition(manager.fileExists(atPath: url.path)) }
        alias = nil
        precondition(weakOwner == nil && !manager.fileExists(atPath: url.path))
        // Adoption does not copy or require existence. Failed retirement logs,
        // rather than throwing/trapping or creating a placeholder file.
        let absent = root.appendingPathComponent("missing")
        var missing: TemporaryFile? = TemporaryFile(adoptingFileAt: FilePath(absent.path))
        precondition(!manager.fileExists(atPath: missing!.path.string))
        missing = nil
        // Path identity/hash, rather than object identity; destruction is per owner.
        let same = root.appendingPathComponent("same")
        try Data().write(to: same)
        var first: TemporaryFile? = TemporaryFile(adoptingFileAt: FilePath(same.path))
        var second: TemporaryFile? = TemporaryFile(adoptingFileAt: FilePath(same.path))
        precondition(first !== second && first == second)
        precondition(first!.hashValue == second!.hashValue)
        first = nil
        precondition(!manager.fileExists(atPath: same.path))
        second = nil
        print("Temporary file ownership checks passed")
    }
}
