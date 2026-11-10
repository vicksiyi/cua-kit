import Foundation
import System
import UniformTypeIdentifiers
import os

// DataFile payload, identity, coding and lazy ownership recovered from native evidence.
// Full original interface/module-boundary audit remains pending.
public class DataFile: Hashable, Codable {
    public let data: Data
    public let filename: String
    public let type: UTType
    private let temporaryFile = OSAllocatedUnfairLock<TemporaryFile?>(initialState: nil)

    public init(data: Data, filename: String, type: UTType?) {
        self.data = data
        self.filename = filename
        self.type = type ?? Self.inferredType(for: filename)
    }

    // 10043c510 compares object pointers; equal bytes do not imply equal owners.
    public static func == (lhs: DataFile, rhs: DataFile) -> Bool { lhs === rhs }
    public func hash(into hasher: inout Hasher) { hasher.combine(ObjectIdentifier(self)) }

    private enum CodingKeys: String, CodingKey { case data, filename, type }

    // 101004984..101004c64: decode all three required fields, then construct
    // a new owner with an empty lazy-file cache.
    public required convenience init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let data = try container.decode(Data.self, forKey: .data)
        let filename = try container.decode(String.self, forKey: .filename)
        let type = try container.decode(UTType.self, forKey: .type)
        self.init(data: data, filename: filename, type: type)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(data, forKey: .data)
        try container.encode(filename, forKey: .filename)
        try container.encode(type, forKey: .type)
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
    public var path: FilePath {
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
    public var fileSize: Int { data.count }
}
