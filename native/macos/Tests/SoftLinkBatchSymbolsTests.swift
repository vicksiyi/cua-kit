import MachO

@main struct SoftLinkBatchSymbolsTests {
    static func main() {
        let headers = UnsafeMutablePointer<mach_header>.allocate(capacity: 4)
        defer { headers.deallocate() }
        let pointer = UnsafeRawPointer(headers)
        let grouped = symbolRequestsByHash([[10,11,10], [], [10]])
        precondition(grouped[10] == [SymbolRequest(index: 0, priority: 0), SymbolRequest(index: 0, priority: 2), SymbolRequest(index: 2, priority: 0)])
        var stages: [String] = []
        var queries: [Set<UInt64>] = []
        let source = BatchSymbolSources(loaded: { images, salt in
            precondition(images == [99] && salt == "salt")
            stages.append("loaded")
            return [ResolvedImage(index: 9, header: UnsafePointer(headers)), ResolvedImage(index: 7, header: UnsafePointer(headers.advanced(by: 1)))]
        }, filesystem: { _, _ in
            stages.append("filesystem")
            return [ResolvedImage(index: 5, header: UnsafePointer(headers.advanced(by: 2))), ResolvedImage(index: 3, header: UnsafePointer(headers.advanced(by: 3)))]
        }, symbols: { header, wanted, _ in
            queries.append(wanted)
            if header == headers { return [11: (pointer, "fallback"), 20: (pointer, "second")] }
            if header == headers.advanced(by: 1) { return [:] }
            if header == headers.advanced(by: 2) { return [10: (pointer.advanced(by: 1), "preferred")] }
            preconditionFailure("priority-zero completion should stop further image visits")
        })
        let result = lookUpBatchSymbolPointers(images: [99], symbolRequests: [[10,11], [20]], salt: "salt", sources: source)
        precondition(result.map { $0.name } == ["preferred", "second"])
        precondition(stages == ["loaded", "filesystem"])
        precondition(queries == [[10,11,20], [10], [10]])
        stages = []; queries = []
        precondition(lookUpBatchSymbolPointers(images: [99], symbolRequests: [], salt: "salt", sources: source).isEmpty)
        precondition(stages.isEmpty && queries.isEmpty)
        // Empty alternatives remain nil, force filesystem stage, but never query symbols.
        let empty = lookUpBatchSymbolPointers(images: [99], symbolRequests: [[]], salt: "salt", sources: source)
        precondition(empty.count == 1 && empty[0].pointer == nil && empty[0].name == nil)
        precondition(stages == ["loaded", "filesystem"] && queries.isEmpty)
        var bestSource = source
        bestSource.filesystem = { _, _ in preconditionFailure("complete preferred matches must not load files") }
        bestSource.symbols = { _, _, _ in
            [10: (pointer, "best"), 11: (pointer.advanced(by: 1), "lower"), 20: (pointer, "other")]
        }
        let best = lookUpBatchSymbolPointers(images: [99], symbolRequests: [[10,11], [20], [10]], salt: "salt", sources: bestSource)
        precondition(best.map { $0.name } == ["best", "other", "best"])
        print("SoftLink batch candidate priorities and fallback staging passed")
    }
}
