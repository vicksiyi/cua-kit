@main struct SoftLinkFilesystemImageRequestsTests {
    static func main() {
        precondition(filesystemImageRequests([]).isEmpty)
        for tag in UInt64(0)...255 {
            let request = (tag << 56) | 0x1234
            let result = filesystemImageRequests([request])
            if tag < 4 {
                precondition(result[ImageSearchStrategy(rawValue: UInt8(tag))!] == [0x1234: [0]])
            } else { precondition(result.isEmpty) }
        }
        let grouped = filesystemImageRequests([
            7, 0xff00_0000_0000_0007, 0x0100_0000_0000_0007,
            7, 0x0200_0000_0000_0008, 0x0300_0000_0000_0007,
            0x0100_0000_0000_0007])
        precondition(grouped[.framework] == [7: [0,3]])
        precondition(grouped[.privateFramework] == [7: [2,6]])
        precondition(grouped[.library] == [8: [4]])
        precondition(grouped[.path] == [7: [5]])
        print("SoftLink filesystem strategy decoding and duplicate indices passed")
    }
}
