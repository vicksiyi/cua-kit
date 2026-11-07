import MachO

@main struct SoftLinkSymbolTableTests {
    static func main() {
        let memory = UnsafeMutableRawPointer.allocate(byteCount: 2048, alignment: 16)
        defer { memory.deallocate() }
        memory.initializeMemory(as: UInt8.self, repeating: 0, count: 2048)
        let image = UnsafeRawPointer(memory)
        var commands = SymbolLoadCommands(textVMAddress: 100, linkeditVMAddress: 500, linkeditFileOffset: 144)
        precondition(linkeditBase(image: image, commands: commands) == image.advanced(by: 256))
        commands.linkeditVMAddress = UInt64.max
        precondition(linkeditBase(image: image, commands: commands) == nil)
        commands.linkeditVMAddress = 500
        commands.symbolOffset = 0; commands.stringOffset = 512
        let linkedit = memory.advanced(by: 256)
        let names: [UInt8] = [0, 65, 0, 66, 0, 67, 0, 68, 0]
        names.withUnsafeBytes { linkedit.advanced(by: 512).copyMemory(from: $0.baseAddress!, byteCount: $0.count) }
        // Zero string index, nonexternal section, upper flag bits, underflow,
        // Int overflow, duplicate result, and valid final entry.
        let entries: [(UInt32, UInt8, UInt64)] = [
            (0, 15, 101), (1, 14, 102), (1, 255, 103),
            (3, 15, 99), (3, 15, UInt64.max), (1, 15, 105),
            (3, 15, 107), (5, 15, 109), (7, 15, 111), (7, 15, 112)]
        commands.symbolCount = UInt32(entries.count)
        for (index, entry) in entries.enumerated() {
            let address = linkedit.advanced(by: index * 16)
            address.storeBytes(of: entry.0, as: UInt32.self)
            address.storeBytes(of: entry.1, toByteOffset: 4, as: UInt8.self)
            address.storeBytes(of: entry.2, toByteOffset: 8, as: UInt64.self)
        }
        var matches: [UInt64: ResolvedSymbol] = [67: (image.advanced(by: 1), "export-C")]
        var visited: [UInt8] = []
        collectSymbolTable(image: image, linkedit: UnsafeRawPointer(linkedit), commands: commands,
                           requested: [65,66,67,68], matches: &matches) { bytes in
            precondition(bytes.count == 1)
            visited.append(bytes[0]); return UInt64(bytes[0])
        }
        precondition(matches[65]!.pointer == image.advanced(by: 3))
        precondition(matches[66]!.pointer == image.advanced(by: 7))
        precondition(matches[67]!.name == "export-C")
        precondition(visited == [65,66,66,65,66,67,68]) // Early exit once all requested keys exist.
        precondition(matches[65]!.name == "A" && matches[66]!.name == "B")
        let salt = "盐🧂\0suffix"
        let key = Array(salt.utf8).withUnsafeBufferPointer { suffix in
            [UInt8(65)].withUnsafeBufferPointer { sipHash(buffer: $0, appending: suffix) }
        }
        var salted: [UInt64: ResolvedSymbol] = [:]
        collectSymbolTable(image: image, linkedit: UnsafeRawPointer(linkedit), commands: commands,
                           requested: [key], matches: &salted, salt: salt)
        precondition(salted[key]!.name == "A" && salted[key]!.pointer == image.advanced(by: 3))
        print("SoftLink symbol-table fallback passed")
    }
}
