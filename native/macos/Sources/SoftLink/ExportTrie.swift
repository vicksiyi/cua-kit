/// Extracted traversal state from the native 72-byte stack item:
/// offset, accumulated raw name, and a streaming SipHashState.
private struct ExportTraversalNode {
    var offset: Int
    var name: [UInt8]
    var hash: SipHashState
}

/// Recovered iterative traversal at 0x10024c4f4. The caller supplies the native
/// dynamic-loader adapter or a fixture resolver. The resolver receives
/// the original name or a nonempty, terminated imported name.
func collectExportTrie(image: UnsafeRawPointer, bytes: UnsafePointer<UInt8>, size: Int,
                       requested: Set<UInt64>, salt: UnsafeBufferPointer<UInt8>,
                       matches: inout [UInt64: ResolvedSymbol],
                       resolveReexport: ([UInt8]) -> UnsafeRawPointer?) {
    var pending = [ExportTraversalNode(offset: 0, name: [], hash: SipHashState())]
    var visited = Set<Int>()
    while let node = pending.popLast() {
        guard node.offset >= 0, node.offset < size, visited.insert(node.offset).inserted else { continue }
        var offset = node.offset
        guard let terminalSize = readULEB128(from: bytes, size: size, offset: &offset) else { continue }
        // Native unsigned addition traps on overflow, then checks Int and size.
        let end = UInt64(offset) + terminalSize
        guard let children = Int(exactly: end), children <= size else { continue }
        if terminalSize != 0, let flags = readULEB128(from: bytes, size: size, offset: &offset) {
            var salted = node.hash
            salted.append(salt)
            let key = salted.finalize()
            if requested.contains(key), matches[key] == nil {
                if flags & 8 != 0 {
                    // Ordinal decode result is ignored in the original.
                    _ = readULEB128(from: bytes, size: children, offset: &offset)
                    let imported = readCStringBytes(from: bytes, size: children, offset: &offset)
                    let lookup = imported.flatMap { $0.isEmpty ? nil : $0 } ?? node.name
                    if let pointer = resolveReexport(lookup) {
                        matches[key] = (pointer, String(decoding: lookup, as: UTF8.self))
                    }
                } else if let address = readULEB128(from: bytes, size: size, offset: &offset),
                          let relative = Int(exactly: address) {
                    matches[key] = (image.advanced(by: relative), String(decoding: node.name, as: UTF8.self))
                }
            }
            if matches.count == requested.count { return }
        }
        guard children < size else { continue }
        let count = Int(bytes[children])
        offset = children + 1
        for _ in 0..<count {
            guard let edge = readCStringBytes(from: bytes, size: size, offset: &offset),
                  let child = readULEB128(from: bytes, size: size, offset: &offset),
                  let childOffset = Int(exactly: child) else { break }
            var hash = node.hash
            edge.withUnsafeBufferPointer { hash.append($0) }
            pending.append(ExportTraversalNode(offset: childOffset, name: node.name + edge, hash: hash))
        }
    }
}
