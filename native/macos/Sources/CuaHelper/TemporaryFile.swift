import Foundation
import System
import os

// Adopted-file ownership from 1010061a0..101006200 and deinit 1010065bc.
// Native System.FilePath is available from the SDK and matches vendor imports.
// Codable and data/copy convenience constructors remain separate.
class TemporaryFile: Hashable {
    enum Error: Swift.Error {
        case invalidFilePath
        case fileDidNotExistAfterCallingWriteBlock
    }

    // Native lazy mutable storage: no additional locking or path normalization.
    static var temporaryDirectory: FilePath = initialTemporaryDirectory(
        base: FilePath(NSTemporaryDirectory()), bundleIdentifier: Bundle.main.bundleIdentifier)

    let path: FilePath

    init(adoptingFileAt path: FilePath) { self.path = path }

    // 101008130: a throwing writer leaves any partial file untouched. Ownership
    // begins only after successful writing and the existence check.
    convenience init(writingNewFile filename: String, withBlock write: (FilePath) throws -> Void) throws {
        let path = TemporaryFile.uniquePath(forFilename: filename, in: TemporaryFile.temporaryDirectory)
        try write(path)
        guard FileManager.default.fileExists(atPath: path.string) else {
            throw Error.fileDidNotExistAfterCallingWriteBlock
        }
        self.init(adoptingFileAt: path)
    }

    static func == (lhs: TemporaryFile, rhs: TemporaryFile) -> Bool {
        lhs.path == rhs.path
    }
    func hash(into hasher: inout Hasher) { path.hash(into: &hasher) }

    deinit {
        do { try FileManager.default.removeItem(atPath: path.string) }
        catch {
            NativeLogger.logger(for: type(of: self)).error("log[da1c38e801a415a6927e] [0]=\(error as NSError)")
        }
    }
}
