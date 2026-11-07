import Carbon
import SoftLink

// 0x10026d988: independent required SoftLink binding, not a guessed name
// passed to dlsym and not a substitute AppKit attention-request operation.
enum ApplicationAttentionSPI {
    private typealias SetAttention = @convention(c) (UnsafeMutablePointer<ProcessSerialNumber>, Bool) -> Int32
    private static let function: SetAttention = {
        let result = lookUpBatchSymbolPointers(images: [0x3b58c75964175f, 0x67b40477029131, 0xe05097e5e1ea0a, 0xc12fd681894ab0, 0x9b1c8084b429a7, 0xc0b9c8634db6be, 0x3fad7a5a5e5ed3, 0xd04e2b033f8a5, 0x45832857fc62d7, 0xb1ac668656855, 0x4db6c24e4295f, 0xee65b73fdf8b20, 0xbae76fa6c7de63, 0xa9eaac5a1078e8, 0x6b8599215c5c05, 0xe1ecd9b1aa90d3, 0x7e0275904f9cac, 0x8eea87d43f16a9, 0x5f9d17ad142bb3, 0x1d7bb726587b98, 0xa0ac997920fefa, 0x25510d69d89bbd, 0x82cbebc146920a, 0x189856766f83a0, 0xc6f6038f649a9b, 0x44214f12e1007b, 0x684155a1a46d15, 0x2cb8501379e50a, 0x520496d9311492, 0x8e6eeaf9cfaa8c],
            symbolRequests: [[0xa79ffcc8ae7934ac, 0xcf0a67151ba6b31]],
            salt: "60f45d85ff2c4d1adec56ccff6a7b9e03cbb9a1e8e733e649271db28fcba863e37f81773bb064ce21295d09a48a966a2df58cf69b148cbcabb94c4a59823071")
        guard let pointer = result.first?.pointer else {
            preconditionFailure("Required application attention SPI is unavailable")
        }
        return unsafeBitCast(pointer, to: SetAttention.self)
    }()
    static func setApplicationDesiresAttention(_ process: UnsafeMutablePointer<ProcessSerialNumber>,
        _ desiresAttention: Bool) -> Int32 {
        function(process, desiresAttention)
    }
}
