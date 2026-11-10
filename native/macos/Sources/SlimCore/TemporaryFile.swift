import Foundation
import System
import os

// Adopted-file ownership from 1010061a0..101006200 and deinit 1010065bc.
// Native System.FilePath is available from the SDK and matches vendor imports.
// Codable stores only the native FilePath; it does not embed file bytes.
public class TemporaryFile: Hashable, Codable {
    public enum Error: Swift.Error {
        case invalidFilePath
        case fileDidNotExistAfterCallingWriteBlock
    }

    // Native lazy mutable storage: no additional locking or path normalization.
    public static var temporaryDirectory: FilePath = initialTemporaryDirectory(
        base: FilePath(NSTemporaryDirectory()), bundleIdentifier: Bundle.main.bundleIdentifier)

    public let path: FilePath

    public init(adoptingFileAt path: FilePath) { self.path = path }

    private enum CodingKeys: String, CodingKey { case path }

    // 101006b98 / 101006d00: keyed FilePath coding, without existence checks.
    public required init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        path = try container.decode(FilePath.self, forKey: .path)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(path, forKey: .path)
    }

    // 101007cac..1010080d8. The native implementation inlines the same
    // select/write/existence/ownership stages as writingNewFile.
    public convenience init(writingData data: Data, as filename: String) throws {
        try self.init(writingNewFile: filename) { path in
            let url = URL(filePath: path.string, directoryHint: .notDirectory, relativeTo: nil)
            try data.write(to: url, options: .withoutOverwriting)
        }
    }

    // 1010062c4..101006470: filename comes from the System component,
    // and FileManager owns copy semantics (including directories and links).
    public convenience init(copyingFileAt source: FilePath) throws {
        guard let filename = source.lastComponent?.string else { throw Error.invalidFilePath }
        try self.init(writingNewFile: filename) { destination in
            try FileManager.default.copyItem(atPath: source.string, toPath: destination.string)
        }
    }

    // 101008130: a throwing writer leaves any partial file untouched. Ownership
    // begins only after successful writing and the existence check.
    public convenience init(writingNewFile filename: String, withBlock write: (FilePath) throws -> Void) throws {
        let path = TemporaryFile.uniquePath(forFilename: filename, in: TemporaryFile.temporaryDirectory)
        try write(path)
        guard FileManager.default.fileExists(atPath: path.string) else {
            throw Error.fileDidNotExistAfterCallingWriteBlock
        }
        self.init(adoptingFileAt: path)
    }

    public static func == (lhs: TemporaryFile, rhs: TemporaryFile) -> Bool {
        lhs.path == rhs.path
    }
    public func hash(into hasher: inout Hasher) { path.hash(into: &hasher) }

    deinit {
        do { try FileManager.default.removeItem(atPath: path.string) }
        catch {
            NativeLogger.logger(for: type(of: self)).error("log[da1c38e801a415a6927e] [0]=\(error as NSError)")
        }
    }
}
