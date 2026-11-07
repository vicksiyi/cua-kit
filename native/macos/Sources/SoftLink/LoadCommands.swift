import MachO

/// Recovered from SoftLink.validCommandSize, 0x10024b890.
/// This validates only the common header size, not command-specific bounds.
public func validCommandSize(_ command: load_command) -> Int? {
    command.cmdsize >= 8 ? Int(command.cmdsize) : nil
}

/// Extracted state from the inline command scan in lookUpSymbols
/// (0x1002490c8..<0x100249350), not a separately named vendor API.
struct SymbolLoadCommands {
    var textVMAddress: UInt64?
    var linkeditVMAddress: UInt64?
    var linkeditFileOffset: UInt64?
    var exportOffset: UInt32?
    var exportSize: UInt32?
    var symbolOffset: UInt32?
    var symbolCount: UInt32?
    var stringOffset: UInt32?
}

/// The caller supplies a valid mapped 64-bit image. Like the original scan,
/// this is not a bounds-checked parser for arbitrary file bytes. Command sizes
/// need not be aligned; command-specific reads can exceed declared cmdsize.
func symbolLoadCommands(image: UnsafeRawPointer) -> SymbolLoadCommands? {
    guard image.loadUnaligned(as: UInt32.self) == MH_MAGIC_64 else { return nil }
    let count = image.loadUnaligned(fromByteOffset: 16, as: UInt32.self)
    var cursor = image.advanced(by: 32)
    var result = SymbolLoadCommands()
    for _ in 0..<count {
        let command = cursor.loadUnaligned(as: load_command.self)
        guard let size = validCommandSize(command) else { return nil }
        switch command.cmd {
        case UInt32(LC_SEGMENT_64):
            let segment = cursor.loadUnaligned(as: segment_command_64.self)
            if segmentName(segment, matches: Array("__TEXT".utf8)) {
                result.textVMAddress = segment.vmaddr
            } else if segmentName(segment, matches: linkeditSegmentName) {
                result.linkeditVMAddress = segment.vmaddr
                result.linkeditFileOffset = segment.fileoff
            }
        case UInt32(LC_SYMTAB):
            result.symbolOffset = cursor.loadUnaligned(fromByteOffset: 8, as: UInt32.self)
            result.symbolCount = cursor.loadUnaligned(fromByteOffset: 12, as: UInt32.self)
            result.stringOffset = cursor.loadUnaligned(fromByteOffset: 16, as: UInt32.self)
        case UInt32(LC_DYLD_INFO), UInt32(LC_DYLD_INFO_ONLY):
            let size = cursor.loadUnaligned(fromByteOffset: 44, as: UInt32.self)
            if size != 0 {
                result.exportOffset = cursor.loadUnaligned(fromByteOffset: 40, as: UInt32.self)
                result.exportSize = size
            }
        case UInt32(LC_DYLD_EXPORTS_TRIE):
            result.exportOffset = cursor.loadUnaligned(fromByteOffset: 8, as: UInt32.self)
            result.exportSize = cursor.loadUnaligned(fromByteOffset: 12, as: UInt32.self)
        default: break
        }
        cursor = cursor.advanced(by: size)
    }
    guard result.textVMAddress != nil, result.linkeditVMAddress != nil else { return nil }
    return result
}
