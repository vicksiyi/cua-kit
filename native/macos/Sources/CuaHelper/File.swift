import Foundation
import System
import UniformTypeIdentifiers

// Native three-payload representation and synthesized keyed enum coding.
// Naming helpers and remaining accessors remain to restore.
enum File: Hashable, Codable {
    enum RepresentationType: Hashable { case data, filePath }

    var representationType: RepresentationType {
        switch self {
        case .path, .temporaryFile: return .filePath
        case .data: return .data
        }
    }

    // 101001880..101001bb4: memory data exists independent of materialization.
    // Path acquisition errors are converted to false before the FileManager read.
    var exists: Bool {
        if representationType == .data { return true }
        guard let path = try? path else { return false }
        return FileManager.default.fileExists(atPath: path.string)
    }

    // 101001bb4..101002194: representation guard precedes path/URL access.
    // SDK resource metadata, not filename suffixes, determines directory status.
    var isDirectory: Bool {
        guard representationType == .filePath, let path = try? path else { return false }
        let url = URL(filePath: path.string, directoryHint: .notDirectory, relativeTo: nil)
        return (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
    }

    case path(FilePath)
    case temporaryFile(TemporaryFile)
    case data(DataFile)

    // Native File routes path and temporary ownership through FilePath witnesses;
    // DataFile returns its payload/name directly and materializes only for path.
    var filename: String {
        switch self {
        case .path(let path): return path.lastComponent?.string ?? ""
        case .temporaryFile(let owner): return owner.path.lastComponent?.string ?? ""
        case .data(let file): return file.filename
        }
    }

    var path: FilePath {
        get throws {
            switch self {
            case .path(let path): return path
            case .temporaryFile(let owner): return owner.path
            case .data(let file): return try file.path
            }
        }
    }

    var data: Data {
        get throws {
            switch self {
            case .data(let file): return file.data
            case .path(let path): return try Self.read(path)
            case .temporaryFile(let owner): return try Self.read(owner.path)
            }
        }
    }

    private static func read(_ path: FilePath) throws -> Data {
        let url = URL(filePath: path.string, directoryHint: .notDirectory, relativeTo: nil)
        return try Data(contentsOf: url, options: .mappedIfSafe)
    }

    init(_ path: FilePath) { self = .path(path) }
    init(_ file: TemporaryFile) { self = .temporaryFile(file) }
    init(data: Data, filename: String, type: UTType?) {
        self = .data(DataFile(data: data, filename: filename, type: type))
    }
}

// Native DataFile witness returns representation tag zero without materializing.
extension DataFile {
    var representationType: File.RepresentationType { .data }
}
