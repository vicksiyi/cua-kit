import Foundation
import System
import UniformTypeIdentifiers

@main struct Check {
    static func main() throws {
        let path = FilePath("fixture-not-created")
        let file = File(path)
        precondition(file == .path(path))
        let encoder = JSONEncoder()
        let decoder = JSONDecoder()
        let pathJSON = try encoder.encode(file)
        let object = try JSONSerialization.jsonObject(with: pathJSON) as! [String: Any]
        let pathPayload = object["path"] as! [String: Any]
        precondition(pathPayload.count == 1 && pathPayload["_0"] != nil)
        precondition(tryDecode(pathJSON) == file)
        let data = DataFile(data: Data([1, 2]), filename: "a.bin", type: .data)
        precondition(File.data(data) == File.data(data))
        precondition(File.data(data) != File(data: data.data, filename: data.filename, type: data.type))
        let dataJSON = try encoder.encode(File.data(data))
        let decoded = try decoder.decode(File.self, from: dataJSON)
        guard case .data(let restored) = decoded else { preconditionFailure("wrong decoded case") }
        precondition(restored.data == data.data && restored != data)
        do {
            _ = try decoder.decode(File.self, from: Data("{\"path\":{},\"data\":{}}".utf8))
            preconditionFailure("multiple cases accepted")
        } catch DecodingError.typeMismatch {} // synthesized one-case contract
        let shot = ScreenshotFile(file: file, url: URL(fileURLWithPath: "/fixture"), mimeType: "image/png")
        let shotData = try encoder.encode(shot)
        let roundtrip = try decoder.decode(ScreenshotFile.self, from: shotData)
        precondition(roundtrip == shot && Set([shot, roundtrip]).count == 1)
        let shotObject = try JSONSerialization.jsonObject(with: shotData) as! [String: Any]
        precondition(Set(shotObject.keys) == Set(["file", "url", "mimeType"]))
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
        defer { try? FileManager.default.removeItem(at: root) }
        let ownedURL = root.appendingPathComponent("shot.png")
        try Data([1]).write(to: ownedURL)
        func makeOwnedShot() -> ScreenshotFile {
            let owner = TemporaryFile(adoptingFileAt: FilePath(ownedURL.path))
            return ScreenshotFile(file: File(owner), url: ownedURL, mimeType: "image/png")
        }
        var owned: ScreenshotFile? = makeOwnedShot()
        precondition(owned?.url == ownedURL && FileManager.default.fileExists(atPath: ownedURL.path))
        var retained = owned
        owned = nil
        precondition(retained?.url == ownedURL && FileManager.default.fileExists(atPath: ownedURL.path))
        retained = nil
        precondition(!FileManager.default.fileExists(atPath: ownedURL.path))
        print("File and ScreenshotFile representation checks passed")
    }
    static func tryDecode(_ data: Data) -> File { try! JSONDecoder().decode(File.self, from: data) }
}
