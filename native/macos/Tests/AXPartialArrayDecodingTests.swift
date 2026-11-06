@main
struct AXPartialArrayDecodingTests {
    static func main() {
        let descriptors: [AXArraySubsetDescriptor?] = [
            nil,
            AXArraySubsetDescriptor(count: 10),
            AXArraySubsetDescriptor(count: 10, availableRanges: []),
            AXArraySubsetDescriptor(count: 10, availableRanges: [4..<6, 1..<2]),
        ]
        for descriptor in descriptors {
            for decoded: [Int]? in [nil, [], [8, 3, 8]] {
                var reads = 0
                let result = decodedAXPartialArray(subsetDescriptor: descriptor) {
                    reads += 1
                    return decoded
                }
                precondition(reads == 1)
                if let decoded {
                    guard let result else { fatalError("Empty arrays are successful decodes") }
                    precondition(result.array == decoded)
                    // Do not slice, reorder, fill gaps, or recompute count/ranges.
                    precondition(result.subsetDescriptor == descriptor)
                } else {
                    precondition(result == nil)
                }
            }
        }
        print("12 native partial-array decoding cases passed")
    }
}
