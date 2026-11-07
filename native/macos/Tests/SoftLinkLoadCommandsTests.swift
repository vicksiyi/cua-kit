import MachO

@main struct SoftLinkLoadCommandsTests {
    static func bytes<T>(_ value: T) -> [UInt8] {
        var value = value
        return withUnsafeBytes(of: &value) { Array($0) }
    }
    static func segment(_ name: String, address: UInt64) -> [UInt8] {
        var value = segment_command_64()
        value.cmd = UInt32(LC_SEGMENT_64)
        value.cmdsize = UInt32(MemoryLayout.size(ofValue: value))
        value.vmaddr = address
        value.fileoff = 17
        withUnsafeMutableBytes(of: &value.segname) { $0.copyBytes(from: Array(name.utf8) + Array(repeating: UInt8(0), count: 16-name.utf8.count)) }
        return bytes(value)
    }
    static func scan(_ commands: [[UInt8]], magic: UInt32 = MH_MAGIC_64) -> SymbolLoadCommands? {
        var header = mach_header_64()
        header.magic = magic
        header.ncmds = UInt32(commands.count)
        // sizeofcmds is deliberately zero: the original scan uses ncmds.
        return (bytes(header) + commands.flatMap { $0 }).withUnsafeBytes { symbolLoadCommands(image: $0.baseAddress!) }
    }
    static func main() {
        for size in UInt32(0)...16 {
            precondition(validCommandSize(load_command(cmd: 0, cmdsize: size)) == (size < 8 ? nil : Int(size)))
        }
        precondition(validCommandSize(load_command(cmd: 0, cmdsize: .max)) == Int(UInt32.max))
        let base = [segment("__TEXT", address: 100), segment("__LINKEDIT", address: 300)]
        precondition(scan([]) == nil)
        precondition(scan([base[0]]) == nil)
        precondition(scan(base, magic: MH_MAGIC) == nil)
        let unknown = bytes(load_command(cmd: 0x123, cmdsize: 9)) + [UInt8(0)]
        precondition(scan([unknown] + base)?.linkeditFileOffset == 17)
        precondition(scan(base + [segment("__TEXT", address: 200)])?.textVMAddress == 200)
        precondition(scan(base + [bytes(load_command(cmd: 0, cmdsize: 7))]) == nil)
        var info = dyld_info_command()
        info.cmd = UInt32(LC_DYLD_INFO_ONLY)
        info.cmdsize = UInt32(MemoryLayout.size(ofValue: info))
        info.export_off = 45; info.export_size = 67
        var trie = linkedit_data_command(cmd: UInt32(LC_DYLD_EXPORTS_TRIE), cmdsize: 16, dataoff: 89, datasize: 12)
        precondition(scan(base + [bytes(info), bytes(trie)])?.exportOffset == 89)
        precondition(scan(base + [bytes(trie), bytes(info)])?.exportOffset == 45)
        info.export_size = 0
        precondition(scan(base + [bytes(trie), bytes(info)])?.exportSize == 12)
        trie.datasize = 0
        precondition(scan(base + [bytes(trie)])?.exportSize == 0)
        info.cmd = UInt32(LC_DYLD_INFO); info.export_size = 4
        precondition(scan(base + [bytes(info)])?.exportSize == 4)
        let sym = symtab_command(cmd: UInt32(LC_SYMTAB), cmdsize: 24, symoff: 20, nsyms: 30, stroff: 40, strsize: 50)
        let result = scan(base + [bytes(sym)])!
        precondition(result.symbolOffset == 20 && result.symbolCount == 30 && result.stringOffset == 40)
        print("SoftLink load-command scan passed")
    }
}
