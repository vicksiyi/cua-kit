import Foundation
import System
import UniformTypeIdentifiers

// Native three-payload representation and synthesized keyed enum coding.
// File's convenience accessors/naming and representationType remain to restore.
enum File: Hashable, Codable {
    case path(FilePath)
    case temporaryFile(TemporaryFile)
    case data(DataFile)

    init(_ path: FilePath) { self = .path(path) }
    init(_ file: TemporaryFile) { self = .temporaryFile(file) }
    init(data: Data, filename: String, type: UTType?) {
        self = .data(DataFile(data: data, filename: filename, type: type))
    }
}
