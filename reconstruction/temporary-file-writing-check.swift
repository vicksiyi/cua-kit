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
        struct PathEnvelope: Codable { let path: FilePath }
        let serializedPath = named.appending("not-created")
        let payload = try JSONEncoder().encode(PathEnvelope(path: serializedPath))
        var decoded: TemporaryFile? = try JSONDecoder().decode(TemporaryFile.self, from: payload)
        precondition(decoded!.path == serializedPath)
        precondition(!fm.fileExists(atPath: serializedPath.string))
        let encoded = try JSONEncoder().encode(decoded!)
        let envelope = try JSONDecoder().decode(PathEnvelope.self, from: encoded)
        precondition(envelope.path == serializedPath)
        // Decoding adopts an absent path; if later materialized, final release removes it.
        try Data().write(to: URL(fileURLWithPath: serializedPath.string))
        decoded = nil
        precondition(!fm.fileExists(atPath: serializedPath.string))
        do {
            _ = try JSONDecoder().decode(TemporaryFile.self, from: Data("{}".utf8))
            preconditionFailure("missing path accepted")
        } catch DecodingError.keyNotFound(let key, _) { precondition(key.stringValue == "path") }
        precondition(Data.WritingOptions.withoutOverwriting.rawValue == 2)
        let dataBytes = Data([0, 255, 1, 0, 10])
        var dataOwner: TemporaryFile? = try TemporaryFile(writingData: dataBytes, as: "data.bin")
        let dataPath = dataOwner!.path
        let actualData = try Data(contentsOf: URL(fileURLWithPath: dataPath.string))
        precondition(actualData == dataBytes)
        var collisionOwner: TemporaryFile? = try TemporaryFile(writingData: Data(), as: "data.bin")
        let collisionPath = collisionOwner!.path
        precondition(collisionPath == named.appending("1/data.bin"))
        let emptyData = try Data(contentsOf: URL(fileURLWithPath: collisionPath.string))
        precondition(emptyData.isEmpty)
        dataOwner = nil
        collisionOwner = nil
        precondition(!fm.fileExists(atPath: dataPath.string))
        precondition(!fm.fileExists(atPath: collisionPath.string))
        TemporaryFile.temporaryDirectory = named.appending("absent-parent")
        do {
            _ = try TemporaryFile(writingData: dataBytes, as: "failed")
            preconditionFailure("missing parent silently created")
        } catch { precondition((error as NSError).domain == NSCocoaErrorDomain) }
        precondition(!fm.fileExists(atPath: TemporaryFile.temporaryDirectory.string))
        TemporaryFile.temporaryDirectory = named
        let source = base.appending("original.txt")
        let bytes = Data([0, 1, 255, 10])
        try bytes.write(to: URL(fileURLWithPath: source.string))
        var copy: TemporaryFile? = try TemporaryFile(copyingFileAt: source)
        let copiedPath = copy!.path
        precondition(copiedPath == named.appending("original.txt"))
        let copiedBytes = try Data(contentsOf: URL(fileURLWithPath: copiedPath.string))
        precondition(copiedBytes == bytes)
        // Collision is handled by the existing numbered-directory selection.
        var secondCopy: TemporaryFile? = try TemporaryFile(copyingFileAt: source)
        let secondPath = secondCopy!.path
        precondition(secondPath == named.appending("1/original.txt"))
        copy = nil
        secondCopy = nil
        precondition(!fm.fileExists(atPath: copiedPath.string))
        precondition(!fm.fileExists(atPath: secondPath.string))
        precondition(fm.fileExists(atPath: source.string))
        for invalid in [FilePath(""), FilePath("/")] {
            do {
                _ = try TemporaryFile(copyingFileAt: invalid)
                preconditionFailure("path without component accepted")
            } catch TemporaryFile.Error.invalidFilePath {}
        }
        do {
            _ = try TemporaryFile(copyingFileAt: base.appending("nonexistent"))
            preconditionFailure("copy failure ignored")
        } catch { precondition((error as NSError).domain == NSCocoaErrorDomain) }
        let sourceDirectory = base.appending("source-directory")
        try fm.createDirectory(atPath: sourceDirectory.string, withIntermediateDirectories: false)
        try bytes.write(to: URL(fileURLWithPath: sourceDirectory.appending("child").string))
        var directoryCopy: TemporaryFile? = try TemporaryFile(copyingFileAt: sourceDirectory)
        let directoryCopyPath = directoryCopy!.path
        let copiedChild = try Data(contentsOf: URL(fileURLWithPath: directoryCopyPath.appending("child").string))
        precondition(copiedChild == bytes)
        directoryCopy = nil
        precondition(!fm.fileExists(atPath: directoryCopyPath.string))
        precondition(fm.fileExists(atPath: sourceDirectory.string))
        print("Temporary file initialization and writing checks passed")
    }
}
