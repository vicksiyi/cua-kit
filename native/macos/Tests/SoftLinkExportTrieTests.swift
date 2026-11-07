@main struct SoftLinkExportTrieTests {
    static func main() {
        let memory = UnsafeMutableRawPointer.allocate(byteCount: 256, alignment: 8)
        defer { memory.deallocate() }
        let image = UnsafeRawPointer(memory)
        func key(_ name: [UInt8]) -> UInt64 {
            name.withUnsafeBufferPointer { sipHash(buffer: $0, appending: UnsafeBufferPointer(start: nil, count: 0)) }
        }
        func collect(_ data: [UInt8], wanted: Set<UInt64>, resolver: ([UInt8]) -> UnsafeRawPointer? = { _ in nil }) -> [UInt64: ResolvedSymbol] {
            var result: [UInt64: ResolvedSymbol] = [:]
            data.withUnsafeBufferPointer {
                collectExportTrie(image: image, bytes: $0.baseAddress!, size: $0.count,
                                  requested: wanted, salt: UnsafeBufferPointer(start: nil, count: 0),
                                  matches: &result, resolveReexport: resolver)
            }
            return result
        }
        let a = key([65]), b = key([66])
        // Two edges, last pushed is visited first; both share one node offset.
        let shared: [UInt8] = [0,2,65,0,8,66,0,8,2,0,25,0]
        let sharedResult = collect(shared, wanted: [a,b])
        precondition(sharedResult.count == 1 && sharedResult[b]!.pointer == image.advanced(by: 25))
        // Self-cycle is skipped by offset visitation, not a step-budget limit.
        precondition(collect([0,1,65,0,0], wanted: [a]).isEmpty)
        // The ordinary address read uses whole-trie bounds, not terminal bounds.
        precondition(collect([0,1,65,0,5,1,0,25,0], wanted: [a])[a]!.pointer == image.advanced(by: 25))
        // Re-export: ordinal 1, imported name B; stored name is imported name.
        var lookups: [[UInt8]] = []
        let reexport: [UInt8] = [0,1,65,0,5,4,8,1,66,0,0]
        let imported = collect(reexport, wanted: [a]) { lookups.append($0); return image }
        precondition(lookups == [[66]] && imported[a]!.name == "B")
        lookups = []
        // Unterminated imported name falls back to original A.
        _ = collect([0,1,65,0,5,3,8,1,66,0], wanted: [a]) { lookups.append($0); return nil }
        precondition(lookups == [[65]])
        precondition(collect([0x80], wanted: [a]).isEmpty)
        precondition(collect([127], wanted: [a]).isEmpty)
        precondition(collect([0,1,65], wanted: [a]).isEmpty)
        print("SoftLink export traversal ordering, bounds and reexports passed")
    }
}
