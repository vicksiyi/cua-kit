import Foundation
import System

@main struct Check {
    static func main() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try fm.createDirectory(at: root, withIntermediateDirectories: false)
        defer { try? fm.removeItem(at: root) }
        let saved = TemporaryFile.temporaryDirectory
        TemporaryFile.temporaryDirectory = FilePath(root.path)
        defer { TemporaryFile.temporaryDirectory = saved }
        precondition(Data.ReadingOptions.mappedIfSafe.rawValue == 1)
        let bytes = Data([0, 255, 7])
        let url = root.appendingPathComponent("existing.bin")
        try bytes.write(to: url)
        let pathFile = File(FilePath(url.path))
        precondition(!pathFile.isDirectory)
        precondition(File(FilePath(root.path)).isDirectory)
        precondition(!File(FilePath(root.appendingPathComponent("missing").path)).isDirectory)
        let dotted = root.appendingPathComponent("directory.png")
        try fm.createDirectory(at: dotted, withIntermediateDirectories: false)
        precondition(File(FilePath(dotted.path)).isDirectory)
        let directoryOwner = TemporaryFile(adoptingFileAt: FilePath(dotted.path))
        precondition(File(directoryOwner).isDirectory)
        let link = root.appendingPathComponent("link")
        try fm.createSymbolicLink(at: link, withDestinationURL: dotted)
        let expectedLink = try URL(filePath: link.path, directoryHint: .notDirectory).resourceValues(forKeys: [.isDirectoryKey]).isDirectory ?? false
        precondition(File(FilePath(link.path)).isDirectory == expectedLink)
        precondition(pathFile.representationType == .filePath && pathFile.exists)
        precondition(!File(FilePath(root.appendingPathComponent("missing").path)).exists)
        precondition(File(FilePath(root.path)).exists)
        precondition(pathFile.filename == "existing.bin")
        let path = try pathFile.path
        let read = try pathFile.data
        precondition(path == FilePath(url.path) && read == bytes)
        precondition(File(FilePath("/")).filename.isEmpty)
        precondition(File(FilePath("")).filename.isEmpty)
        let memory = File(data: bytes, filename: "memory.bin", type: nil)
        precondition(memory.representationType == .data && memory.exists)
        let unavailable = TemporaryFile.temporaryDirectory
        TemporaryFile.temporaryDirectory = unavailable.appending("missing-parent")
        precondition(!memory.isDirectory)
        precondition(memory.exists) // Must not attempt a write even when it would fail.
        precondition(!fm.fileExists(atPath: TemporaryFile.temporaryDirectory.string))
        TemporaryFile.temporaryDirectory = unavailable
        let memoryData = try memory.data
        precondition(memoryData == bytes && memory.filename == "memory.bin")
        precondition(!fm.fileExists(atPath: root.appendingPathComponent("memory.bin").path))
        let materialized = try memory.path
        precondition(fm.fileExists(atPath: materialized.string))
        let owner = TemporaryFile(adoptingFileAt: FilePath(url.path))
        let temporary = File(owner)
        let temporaryData = try temporary.data
        precondition(temporaryData == bytes && temporary.filename == "existing.bin")
        try fm.removeItem(at: url)
        do { _ = try temporary.data; preconditionFailure("read failure hidden") }
        catch { precondition((error as NSError).domain == NSCocoaErrorDomain) }
        precondition(temporary.representationType == .filePath && !temporary.exists)
        precondition(!memory.isDirectory)
        precondition(memory.exists) // representation does not change after materialization
        let retainedPath = try temporary.path
        precondition(retainedPath == FilePath(url.path))
        print("File accessor routing checks passed")
    }
}
