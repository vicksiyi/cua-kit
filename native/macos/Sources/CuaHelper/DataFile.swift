import Foundation
import System
import UniformTypeIdentifiers

// Partial DataFile: immutable payload and constructor from 101004648..101004868.
// Native lazy materialization/locking, coding and equality remain to restore.
class DataFile {
    let data: Data
    let filename: String
    let type: UTType

    init(data: Data, filename: String, type: UTType?) {
        self.data = data
        self.filename = filename
        self.type = type ?? Self.inferredType(for: filename)
    }

    // 101003d70..101003fa8. A filename must be ONE System component:
    // treating it as a FilePath and selecting its last component changes behavior.
    static func inferredType(for filename: String) -> UTType {
        guard let component = FilePath.Component(filename),
              let ext = component.extension,
              let type = UTType(filenameExtension: ext, conformingTo: .data)
        else { return .data }
        return type
    }

    // 101003bd4: native Data storage variants reduce to Data.count.
    var fileSize: Int { data.count }
}
