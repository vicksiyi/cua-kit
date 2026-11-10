import Foundation
import System
import UniformTypeIdentifiers

@main struct Check {
    static func main() throws {
        let bytes = Data([0, 255, 1])
        let explicit = DataFile(data: bytes, filename: "picture.png", type: .jpeg)
        precondition(explicit.type == .jpeg && explicit.data == bytes)
        precondition(explicit.filename == "picture.png" && explicit.fileSize == 3)
        let sameBytes = DataFile(data: bytes, filename: "picture.png", type: .jpeg)
        precondition(explicit != sameBytes)
        precondition(Set([explicit, explicit, sameBytes]).count == 2)
        struct Envelope: Codable { let data: Data; let filename: String; let type: UTType }
        let json = try JSONEncoder().encode(explicit)
        let envelope = try JSONDecoder().decode(Envelope.self, from: json)
        precondition(envelope.data == bytes && envelope.filename == "picture.png" && envelope.type == .jpeg)
        let decoded = try JSONDecoder().decode(DataFile.self, from: JSONEncoder().encode(envelope))
        precondition(decoded != explicit && decoded.data == bytes && decoded.type == .jpeg)
        let missingType = try JSONSerialization.data(withJSONObject: ["data": "", "filename": "a.png"])
        do {
            _ = try JSONDecoder().decode(DataFile.self, from: missingType)
            preconditionFailure("missing type inferred during decode")
        } catch DecodingError.keyNotFound(let key, _) { precondition(key.stringValue == "type") }
        let inferred = DataFile(data: Data(), filename: "picture.png", type: nil)
        precondition(inferred.type == .png && inferred.fileSize == 0)
        for name in ["", "/", "folder/picture.png", "plain", ".hidden"] {
            precondition(DataFile.inferredType(for: name) == .data)
        }
        for name in ["note.txt", "UPPER.PNG", "unknown.xyzfixture", "multi.part.jpeg", "tail."] {
            let component = FilePath.Component(name)
            let expected = component?.extension.flatMap { UTType(filenameExtension: $0, conformingTo: .data) } ?? .data
            precondition(DataFile.inferredType(for: name) == expected)
        }
        print("DataFile constructor and component inference checks passed")
    }
}
