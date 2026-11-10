import Foundation
import System
import UniformTypeIdentifiers
import SlimCore

// Typechecked as a separate consumer, without compiling implementation sources.
func checkSlimCoreFileSurface(_ path: FilePath, decoder: Decoder, encoder: Encoder) throws {
    let memory = DataFile(data: Data(), filename: "fixture", type: .data)
    let file = File.data(memory)
    let _: File.RepresentationType = memory.representationType
    _ = file.exists
    _ = file.isDirectory
    _ = file.type
    _ = file.filename
    _ = file.pathOrFilename
    _ = try file.fileSize
    _ = try file.path
    _ = try file.data
    _ = try file.textContents()
    _ = try DataFile(from: decoder)
    _ = try File(from: decoder)
    try file.encode(to: encoder)
    let owner = TemporaryFile(adoptingFileAt: path)
    let shot = ScreenshotFile(file: File(owner), url: URL(filePath: path.string), mimeType: "image/png")
    _ = shot.file
    _ = shot.url
    _ = shot.mimeType
    _ = File.filename(nil, reservedUTF16Count: 0, date: nil, type: .png)
    _ = File.directoryName(nil, reservedUTF16Count: 0, date: nil)
    _ = File.pathExtension(for: .png)
    _ = TemporaryFile.uniquePath(forFilename: "fixture", in: path)
    _ = NativeLogger.logger(for: DataFile.self)
}
