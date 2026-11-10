import Foundation
import System
import os

extension TemporaryFile {
    // Extracted initialization stage, 10100707c..1010074a0. Parameters expose
    // the environment boundary for owned-directory tests, not a new policy.
    static func initialTemporaryDirectory(base: FilePath, bundleIdentifier: String?) -> FilePath {
        let directory = base.appending(bundleIdentifier ?? "inc.software.unknown")
        do {
            try prepareTemporaryDirectory(directory)
            return directory
        } catch {
            NativeLogger.logger(for: TemporaryFile.self).error("Failed to create Software temporary directory at \(directory.string)")
            return base
        }
    }

    // 101005d78..101006148. Only a collision introduces a numbered directory;
    // the initial directory is not prepared here. No path is atomically reserved.
    static func uniquePath(forFilename filename: String, in directory: FilePath) -> FilePath {
        let manager = FileManager.default
        var candidate = directory.appending(filename)
        var newDirectory: FilePath?
        var number = 1
        while manager.fileExists(atPath: candidate.string) {
            let numbered = directory.appending(String(number))
            candidate = numbered.appending(filename)
            newDirectory = numbered
            number += 1
        }
        if let newDirectory { try? prepareTemporaryDirectory(newDirectory, manager: manager) }
        return candidate
    }

    // 101007924..101007c68. An existing regular file is logged, removed, then
    // replaced by a directory; removal/creation errors propagate to this caller.
    // uniquePath intentionally discards them, matching the source's try? boundary.
    static func prepareTemporaryDirectory(_ directory: FilePath,
        manager: FileManager = .default
    ) throws {
        let path = directory.string
        var isDirectory: ObjCBool = false
        if manager.fileExists(atPath: path, isDirectory: &isDirectory) {
            if isDirectory.boolValue { return }
            NativeLogger.logger(for: TemporaryFile.self).error("Temporary directory was unexpectedly a regular file at \(path)")
            try manager.removeItem(atPath: path)
        }
        try manager.createDirectory(atPath: path, withIntermediateDirectories: true, attributes: nil)
    }
}
