import Foundation
import System
import UniformTypeIdentifiers

@main struct Check {
    static func main() {
        let bytes = Data([0, 255, 1])
        let explicit = DataFile(data: bytes, filename: "picture.png", type: .jpeg)
        precondition(explicit.type == .jpeg && explicit.data == bytes)
        precondition(explicit.filename == "picture.png" && explicit.fileSize == 3)
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
