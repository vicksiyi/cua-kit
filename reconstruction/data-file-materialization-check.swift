import Foundation
import System
import os

@main struct Check {
    static func main() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try fm.createDirectory(at: root, withIntermediateDirectories: false)
        defer { try? fm.removeItem(at: root) }
        let previous = TemporaryFile.temporaryDirectory
        TemporaryFile.temporaryDirectory = FilePath(root.path)
        defer { TemporaryFile.temporaryDirectory = previous }
        let bytes = Data([0, 255, 3, 4])
        var file: DataFile? = DataFile(data: bytes, filename: "fixture.bin", type: nil)
        let initialChildren = try fm.contentsOfDirectory(atPath: root.path)
        precondition(initialChildren.isEmpty)
        let path = try file!.path
        let output = try Data(contentsOf: URL(fileURLWithPath: path.string))
        precondition(output == bytes)
        let cached = try file!.path
        precondition(cached == path)
        // Cached path survives external deletion; no silent recreation.
        try fm.removeItem(atPath: path.string)
        let afterDeletion = try file!.path
        precondition(afterDeletion == path)
        precondition(!fm.fileExists(atPath: path.string))
        try bytes.write(to: URL(fileURLWithPath: path.string))
        file = nil
        precondition(!fm.fileExists(atPath: path.string))

        let retry = DataFile(data: bytes, filename: "retry.bin", type: nil)
        TemporaryFile.temporaryDirectory = FilePath(root.path).appending("missing")
        do { _ = try retry.path; preconditionFailure("write unexpectedly succeeded") }
        catch { precondition((error as NSError).domain == NSCocoaErrorDomain) }
        TemporaryFile.temporaryDirectory = FilePath(root.path)
        let retried = try retry.path
        precondition(fm.fileExists(atPath: retried.string))

        // All callers share one owner; lock covers the write, not just publication.
        let concurrent = DataFile(data: bytes, filename: "concurrent.bin", type: nil)
        let results = OSAllocatedUnfairLock<[FilePath]>(initialState: [])
        let errors = OSAllocatedUnfairLock<[String]>(initialState: [])
        DispatchQueue.concurrentPerform(iterations: 24) { _ in
            do { let selected = try concurrent.path; results.withLock { $0.append(selected) } }
            catch { errors.withLock { $0.append(String(describing: error)) } }
        }
        precondition(errors.withLock { $0.isEmpty })
        precondition(results.withLock { $0.count == 24 && Set($0).count == 1 })
        let children = try fm.contentsOfDirectory(atPath: root.path)
        precondition(Set(children) == Set(["retry.bin", "concurrent.bin"]))
        print("DataFile lazy materialization and concurrency checks passed")
    }
}
