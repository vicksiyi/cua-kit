import Foundation
import System
import UniformTypeIdentifiers
import os

// Partial DataFile: immutable payload and constructor from 101004648..101004868.
// Coding and equality remain to restore.
class DataFile {
    let data: Data
    let filename: String
    let type: UTType
    private let temporaryFile = OSAllocatedUnfairLock<TemporaryFile?>(initialState: nil)

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

    // 101003c2c..101003d70: hold the native unfair lock across creation.
    // Cache only success; return cached path without rechecking existence.
    var path: FilePath {
        get throws {
            try temporaryFile.withLock { owner in
                if let owner { return owner.path }
                let created = try TemporaryFile(writingData: data, as: filename)
                owner = created
                return created.path
            }
        }
    }

    // 101003bd4: native Data storage variants reduce to Data.count.
    var fileSize: Int { data.count }
}
