import MachO
import Darwin

/// Extracted from lookUpSymbols, 0x10024939c..<0x1002493bc.
/// Original Swift arithmetic traps if the second subtraction overflows.
func linkeditBase(image: UnsafeRawPointer, commands: SymbolLoadCommands) -> UnsafeRawPointer? {
    guard let text = commands.textVMAddress, let vm = commands.linkeditVMAddress,
          let file = commands.linkeditFileOffset,
          let textAddress = Int(exactly: text), let vmAddress = Int(exactly: vm),
          let fileOffset = Int(exactly: file) else { return nil }
    return image.advanced(by: (vmAddress - textAddress) - fileOffset)
}

typealias ResolvedSymbol = (pointer: UnsafeRawPointer, name: String)

/// Extracted symbol-table fallback, 0x100249510..<0x1002496c8.
/// The hash dependency receives the raw name bytes (excluding NUL). Production
/// can use the recovered salted overload below.
/// `matches` may already contain export-trie results; those take precedence.
func collectSymbolTable(image: UnsafeRawPointer, linkedit: UnsafeRawPointer,
                        commands: SymbolLoadCommands, requested: Set<UInt64>,
                        matches: inout [UInt64: ResolvedSymbol],
                        hash: (UnsafeBufferPointer<UInt8>) -> UInt64) {
    guard let offset = commands.symbolOffset, let count = commands.symbolCount,
          let strings = commands.stringOffset, let text = commands.textVMAddress else { return }
    let table = linkedit.advanced(by: Int(offset))
    let stringTable = linkedit.advanced(by: Int(strings))
    for index in 0..<Int(count) {
        let entry = table.advanced(by: index * 16)
        let stringIndex = entry.loadUnaligned(as: UInt32.self)
        guard stringIndex != 0 else { continue }
        let type = entry.loadUnaligned(fromByteOffset: 4, as: UInt8.self)
        // Native bics tests all four low bits, without filtering upper bits.
        guard type & 0x0f == 0x0f else { continue }
        let value = entry.loadUnaligned(fromByteOffset: 8, as: UInt64.self)
        let name = stringTable.advanced(by: Int(stringIndex)).assumingMemoryBound(to: CChar.self)
        let raw = UnsafeRawPointer(name).assumingMemoryBound(to: UInt8.self)
        let key = hash(UnsafeBufferPointer(start: raw, count: strlen(name)))
        guard requested.contains(key), matches[key] == nil,
              value >= text, let relative = Int(exactly: value - text) else { continue }
        matches[key] = (image.advanced(by: relative), String(cString: name))
        if matches.count == requested.count { return }
    }
}

/// Original lookUpSymbols builds UTF-8 salt bytes at 0x10024952c, then
/// hashes each raw symbol name followed by those bytes at 0x1002495d0.
func collectSymbolTable(image: UnsafeRawPointer, linkedit: UnsafeRawPointer,
                        commands: SymbolLoadCommands, requested: Set<UInt64>,
                        matches: inout [UInt64: ResolvedSymbol], salt: String) {
    Array(salt.utf8).withUnsafeBufferPointer { suffix in
        collectSymbolTable(image: image, linkedit: linkedit, commands: commands,
                           requested: requested, matches: &matches) { name in
            sipHash(buffer: name, appending: suffix)
        }
    }
}
