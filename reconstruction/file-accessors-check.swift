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
        precondition(pathFile.filename == "existing.bin")
        let path = try pathFile.path
        let read = try pathFile.data
        precondition(path == FilePath(url.path) && read == bytes)
        precondition(File(FilePath("/")).filename.isEmpty)
        precondition(File(FilePath("")).filename.isEmpty)
        let memory = File(data: bytes, filename: "memory.bin", type: nil)
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
        let retainedPath = try temporary.path
        precondition(retainedPath == FilePath(url.path))
        print("File accessor routing checks passed")
    }
}
