import MachO

struct SymbolRequest: Equatable {
    let index: Int
    let priority: Int
}

struct SymbolRequestMatch {
    let priority: Int
    let pointer: UnsafeRawPointer
    let name: String
}

/// Native 0x1002486b4: outer index is output slot, inner index is priority.
func symbolRequestsByHash(_ requests: [[UInt64]]) -> [UInt64: [SymbolRequest]] {
    var result: [UInt64: [SymbolRequest]] = [:]
    for (index, alternatives) in requests.enumerated() {
        for (priority, hash) in alternatives.enumerated() {
            result[hash, default: []].append(SymbolRequest(index: index, priority: priority))
        }
    }
    return result
}

/// Extracted dependency boundary. BatchSymbolSystem composes the recovered
/// platform stages; fixtures can inject each stage independently.
struct BatchSymbolSources {
    var loaded: ([UInt64], String) -> [ResolvedImage]
    var filesystem: ([UInt64], String) -> [ResolvedImage]
    var symbols: (UnsafePointer<mach_header>, Set<UInt64>, String) -> [UInt64: ResolvedSymbol]
}

/// Batch orchestration from 0x100248374, pending hashes from 0x1002489c8,
/// and per-image candidate selection from 0x100248b4c.
func lookUpBatchSymbolPointers(images: [UInt64], symbolRequests: [[UInt64]], salt: String,
                              sources: BatchSymbolSources) -> [(pointer: UnsafeRawPointer?, name: String?)] {
    guard !symbolRequests.isEmpty else { return [] }
    let requests = symbolRequestsByHash(symbolRequests)
    var matches = Array<SymbolRequestMatch?>(repeating: nil, count: symbolRequests.count)
    func complete() -> Bool { matches.allSatisfy { $0?.priority == 0 } }
    func visit(_ image: ResolvedImage) {
        let pending = Set(requests.compactMap { hash, requests in
            requests.contains { request in
                matches[request.index].map { request.priority < $0.priority } ?? true
            } ? hash : nil
        })
        guard !pending.isEmpty else { return }
        let found = sources.symbols(image.header, pending, salt)
        // Native collects the best candidate per output slot before publishing
        // this image's updates. Equal priority preserves the existing result.
        var candidates: [Int: SymbolRequestMatch] = [:]
        for (hash, symbol) in found {
            for request in requests[hash] ?? [] {
                if let current = matches[request.index], request.priority >= current.priority { continue }
                if let candidate = candidates[request.index], request.priority >= candidate.priority { continue }
                candidates[request.index] = SymbolRequestMatch(priority: request.priority, pointer: symbol.pointer, name: symbol.name)
            }
        }
        for (index, candidate) in candidates {
            if matches[index].map({ candidate.priority < $0.priority }) ?? true { matches[index] = candidate }
        }
    }
    for image in sources.loaded(images, salt) {
        visit(image)
        if complete() { break }
    }
    if !complete() {
        for image in sources.filesystem(images, salt) {
            visit(image)
            if complete() { break }
        }
    }
    return matches.map { match in
        guard let match else { return (nil, nil) }
        return (match.pointer, match.name)
    }
}
