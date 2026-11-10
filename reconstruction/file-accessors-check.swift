import Foundation
import System
import UniformTypeIdentifiers

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
        precondition(File.pathExtension(for: .png) == ".png")
        precondition(File.pathExtension(for: .jpeg) == ".jpeg")
        precondition(File.pathExtension(for: .data).isEmpty)
        precondition(File.pathExtension(for: .folder).isEmpty)
        for type in [UTType.pdf, .plainText, .html, .json, .heic] {
            let appended = (" " as NSString).appendingPathExtension(for: type)
            precondition(" " + File.pathExtension(for: type) == appended)
        }
        let textURL = root.appendingPathComponent("text.txt")
        let text = "hello 中文 🌍"
        try text.write(to: textURL, atomically: false, encoding: .utf16)
        let textFile = File(FilePath(textURL.path))
        let textResult = try textFile.textContents()
        precondition(textResult == text && textFile.pathOrFilename == textURL.path)
        let memoryText = File(data: Data(text.utf8), filename: "memory-text.txt", type: .plainText)
        precondition(memoryText.pathOrFilename == "memory-text.txt")
        let memoryTextURL = root.appendingPathComponent("memory-text.txt")
        precondition(!fm.fileExists(atPath: memoryTextURL.path))
        let materializedText = try memoryText.textContents()
        precondition(materializedText == text && fm.fileExists(atPath: memoryTextURL.path))
        precondition(memoryText.pathOrFilename == "memory-text.txt")
        do {
            _ = try File(FilePath(root.appendingPathComponent("missing-text").path)).textContents()
            preconditionFailure("missing text error hidden")
        } catch { precondition((error as NSError).domain == NSCocoaErrorDomain) }
        let bytes = Data([0, 255, 7])
        let url = root.appendingPathComponent("existing.bin")
        try bytes.write(to: url)
        let pathFile = File(FilePath(url.path))
        let missingPNG = File(FilePath(root.appendingPathComponent("missing.png").path))
        precondition(missingPNG.type == .png)
        precondition(File(FilePath(root.appendingPathComponent("plain").path)).type == .data)
        let actualURLType = try url.resourceValues(forKeys: [.contentTypeKey]).contentType
        let expectedType = actualURLType ?? UTType(filenameExtension: url.pathExtension, conformingTo: .data) ?? .data
        precondition(pathFile.type == expectedType)
        precondition(File(FilePath(root.path)).type == .folder)
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
        let pathSize = try pathFile.fileSize
        precondition(pathSize == bytes.count)
        let read = try pathFile.data
        precondition(path == FilePath(url.path) && read == bytes)
        precondition(File(FilePath("/")).filename.isEmpty)
        precondition(File(FilePath("")).filename.isEmpty)
        let memory = File(data: bytes, filename: "memory.bin", type: nil)
        let explicitMemory = File(data: bytes, filename: "wrong.png", type: .jpeg)
        precondition(explicitMemory.type == .jpeg)
        precondition(!fm.fileExists(atPath: root.appendingPathComponent("wrong.png").path))
        precondition(memory.representationType == .data && memory.exists)
        let unavailable = TemporaryFile.temporaryDirectory
        TemporaryFile.temporaryDirectory = unavailable.appending("missing-parent")
        let memorySize = try memory.fileSize
        precondition(memorySize == bytes.count)
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
        precondition(temporary.type == expectedType)
        let temporarySize = try temporary.fileSize
        precondition(temporarySize == bytes.count)
        let temporaryData = try temporary.data
        precondition(temporaryData == bytes && temporary.filename == "existing.bin")
        try fm.removeItem(at: url)
        do { _ = try temporary.data; preconditionFailure("read failure hidden") }
        catch { precondition((error as NSError).domain == NSCocoaErrorDomain) }
        do { _ = try temporary.fileSize; preconditionFailure("size read failure hidden") }
        catch { precondition((error as NSError).domain == NSCocoaErrorDomain) }
        precondition(temporary.representationType == .filePath && !temporary.exists)
        precondition(!memory.isDirectory)
        precondition(memory.exists) // representation does not change after materialization
        let retainedPath = try temporary.path
        precondition(retainedPath == FilePath(url.path))
        print("File accessor routing checks passed")
    }
}
