import MachO

@main struct SoftLinkLookUpSymbolsTests {
    static func main() {
        let memory = UnsafeMutableRawPointer.allocate(byteCount: 4096, alignment: 16)
        defer { memory.deallocate() }
        memory.initializeMemory(as: UInt8.self, repeating: 0, count: 4096)
        let image = UnsafeRawPointer(memory)
        let header = image.assumingMemoryBound(to: mach_header.self)
        func key(_ text: String) -> UInt64 {
            Array(text.utf8).withUnsafeBufferPointer { name in
                [UInt8(90)].withUnsafeBufferPointer { sipHash(buffer: name, appending: $0) }
            }
        }
        func write<T>(_ value: T, at offset: Int) {
            var value = value
            withUnsafeBytes(of: &value) { memory.advanced(by: offset).copyMemory(from: $0.baseAddress!, byteCount: $0.count) }
        }
        func segment(_ name: String) -> segment_command_64 {
            var segment = segment_command_64()
            segment.cmd = UInt32(LC_SEGMENT_64); segment.cmdsize = 72; segment.vmaddr = 4096
            withUnsafeMutableBytes(of: &segment.segname) { $0.copyBytes(from: Array(name.utf8) + Array(repeating: UInt8(0), count: 16-name.utf8.count)) }
            return segment
        }
        var h = mach_header_64(); h.magic = MH_MAGIC_64; h.ncmds = 4
        write(h, at: 0)
        write(segment("__TEXT"), at: 32); write(segment("__LINKEDIT"), at: 104)
        write(linkedit_data_command(cmd: UInt32(LC_DYLD_EXPORTS_TRIE), cmdsize: 16, dataoff: 256, datasize: 9), at: 176)
        write(symtab_command(cmd: UInt32(LC_SYMTAB), cmdsize: 24, symoff: 512, nsyms: 2, stroff: 768, strsize: 5), at: 192)
        let trie: [UInt8] = [0,1,65,0,5,2,0,25,0]
        trie.withUnsafeBytes { memory.advanced(by: 256).copyMemory(from: $0.baseAddress!, byteCount: $0.count) }
        // nlist entries for A and B; export A must win over symbol-table A.
        for (index, stringIndex) in [UInt32(1),3].enumerated() {
            write(stringIndex, at: 512 + index*16)
            write(UInt8(15), at: 516 + index*16)
            write(UInt64(4096 + 100 + index), at: 520 + index*16)
        }
        let names: [UInt8] = [0,65,0,66,0]
        names.withUnsafeBytes { memory.advanced(by: 768).copyMemory(from: $0.baseAddress!, byteCount: $0.count) }
        let a = key("A"), b = key("B")
        let both = lookUpSymbols(image: header, symbols: [a,b], salt: "Z")
        precondition(both[a]!.pointer == image.advanced(by: 25))
        precondition(both[b]!.pointer == image.advanced(by: 101))
        // Invalid export node still allows symbol-table fallback.
        write(UInt8(127), at: 256)
        precondition(lookUpSymbols(image: header, symbols: [a], salt: "Z")[a]!.pointer == image.advanced(by: 100))
        precondition(lookUpSymbols(image: nil, symbols: [a], salt: "Z").isEmpty)
        precondition(lookUpSymbols(image: header, symbols: [], salt: "Z").isEmpty)
        write(UInt32(MH_MAGIC), at: 0)
        precondition(lookUpSymbols(image: header, symbols: [a], salt: "Z").isEmpty)
        var attempts: [String] = []
        let resolved = resolveReexport(Array("_name".utf8)) { name in
            attempts.append(name); return name == "name" ? image : nil
        }
        precondition(resolved == image && attempts == ["_name", "name"])
        attempts = []
        _ = resolveReexport(Array("_name".utf8)) { attempts.append($0); return image }
        precondition(attempts == ["_name"])
        attempts = []
        _ = resolveReexport([0xff]) { attempts.append($0); return nil }
        precondition(attempts == ["�"])
        // Resolve a public system symbol only; do not invoke the returned code.
        precondition(resolveReexport(Array("_malloc".utf8)) != nil)
        print("SoftLink image lookup integration and reexport adapter passed")
    }
}
