import MachO

/// Restored image-local entry point at 0x100249078. The image must be an
/// accessible mapped Mach-O image, not untrusted on-disk bytes.
public func lookUpSymbols(image: UnsafePointer<mach_header>?, symbols: Set<UInt64>,
                          salt: String) -> [UInt64: (pointer: UnsafeRawPointer, name: String)] {
    guard let image, !symbols.isEmpty else { return [:] }
    let pointer = UnsafeRawPointer(image)
    guard let commands = symbolLoadCommands(image: pointer),
          let linkedit = linkeditBase(image: pointer, commands: commands) else { return [:] }
    var matches: [UInt64: ResolvedSymbol] = [:]
    if let offset = commands.exportOffset, let size = commands.exportSize, size != 0 {
        Array(salt.utf8).withUnsafeBufferPointer { suffix in
            collectExportTrie(image: pointer,
                              bytes: linkedit.advanced(by: Int(offset)).assumingMemoryBound(to: UInt8.self),
                              size: Int(size), requested: symbols, salt: suffix, matches: &matches,
                              resolveReexport: { resolveReexport($0) })
        }
        if matches.count == symbols.count { return matches }
    }
    collectSymbolTable(image: pointer, linkedit: linkedit, commands: commands,
                       requested: symbols, matches: &matches, salt: salt)
    return matches
}
