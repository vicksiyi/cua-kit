import MachO
import Darwin

@main struct SoftLinkImagesTests {
    static func main() {
        let headers = UnsafeMutablePointer<mach_header>.allocate(capacity: 5)
        defer { headers.deallocate() }
        let names = ["/one/A", "/two/B", "/one/A", "/missing/header", "/missing/name"].map { (name: String) in name.withCString { strdup($0)! } }
        defer { names.forEach { free($0) } }
        func key(_ name: String) -> UInt64 {
            Array(name.utf8).withUnsafeBufferPointer { path in
                Array("盐".utf8).withUnsafeBufferPointer { sipHash(buffer: path, appending: $0) }
            }
        }
        let a = key("/one/A"), b = key("/two/B")
        var headerReads: [UInt32] = [], nameReads: [UInt32] = []
        var countReads = 0
        let loaded = LoadedImages(count: { countReads += 1; return 5 }, header: { index in
            headerReads.append(index)
            return index == 3 ? nil : UnsafePointer(headers.advanced(by: Int(index)))
        }, name: { index in
            nameReads.append(index)
            return index == 4 ? nil : UnsafePointer(names[Int(index)])
        })
        precondition(lookUpImages(images: [], salt: "盐", loaded: loaded).isEmpty && countReads == 0)
        let result = lookUpImages(images: [b, a, a ^ 0xff00_0000_0000_0000, key("absent")], salt: "盐", loaded: loaded)
        precondition(result.map(\.index) == [0,1,2])
        precondition(result[0].header == headers.advanced(by: 1))
        precondition(result[1].header == headers && result[2].header == headers)
        precondition(headerReads == [0,1,2,3,4] && nameReads == [0,1,2,4] && countReads == 1)
        Array("盐".utf8).withUnsafeBufferPointer { suffix in
            precondition(imagePath(UnsafePointer(names[0]), matchesAnyOf: [a ^ 0xaa00_0000_0000_0000], appending: suffix))
            precondition(!imagePath(UnsafePointer(names[0]), matchesAnyOf: [key("A")], appending: suffix))
            precondition(!imagePath(UnsafePointer(names[0]), matchesAnyOf: [], appending: suffix))
        }
        // Read only the owned test process's dyld inventory; no module is loaded.
        let currentName = _dyld_get_image_name(0)!
        let expected = _dyld_get_image_header(0)!
        let bytes = UnsafeRawPointer(currentName).assumingMemoryBound(to: UInt8.self)
        let currentKey = sipHash(bytes: bytes, count: strlen(currentName), appending: UnsafeBufferPointer(start: nil, count: 0))
        let current = lookUpImages(images: [currentKey], salt: "")
        precondition(current.count == 1 && current[0].index == 0 && current[0].header == expected)
        print("SoftLink loaded-image matching and request ordering passed")
    }
}
