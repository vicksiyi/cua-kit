// Extracted from pinned native WindowServerSPI initializers.
struct WindowServerSPISymbolRequest {
    let images: [UInt64]
    let symbols: [[UInt64]]
    let salt: String
    static let functions = Self(images: [0x253eb533e041dd, 0x2c94b0c3b11563, 0xcae07d2407ffb5, 0xf5886f92bc60d2, 0xb62b168b5cbca9],
        symbols: [[0xb8aa1efa4ee2a468, 0xcfd093ed1f258cb0], [0x6b292ff6b099df0a, 0x13ccbce7d843f3fa], [0x47cfc84f1f9b7a53, 0x7651a884d805913], [0x8c54d6a623d87d73, 0xab968be7a33bb4e6], [0x8359bf0a4fdefdc6, 0x511c39071db5fe18], [0x8d7b0da590d450c8, 0xe5b6df5fc3ad8363], [0xa9e41cf4f3b39d29, 0x108dfae2fd76d221], [0xa45c7215bac1199f, 0x45195e727f53c213], [0x9aa9c9fa7b67a077, 0x929521ba7acec72f], [0xa3c568c10a9a8379, 0x59478c6167dbc775], [0x176f0973ba424f44, 0xc59bcff8de1918a9], [0x6d53dddb08abc548, 0xded703503d776e1f], [0xe647e94bd71f7f49, 0xfd9cfa6f3a07b7c0]],
        salt: "ebbe0218b18ca6b4493c619b63995e9a1e6e99df8b31fbbf83df57c1a88f03a4ec79935df9ef1100aea5c7ace6500161e86b66b25bf72bfc1af6891e98f7c319")
    static let disableUpdate = Self(images: [0x16b8d0729fb55e1, 0x164a519ada917ab, 0x1f639ff51c6e938, 0x1bf3629a4246136, 0x1fd40334cce0f4d],
        symbols: [[0xb049de495927e963, 0x210d588cc6eecaa4]],
        salt: "a48df15ed80b5c5ca600833915962bafb380fbd36314d32e75df13a2b83f0048b1b7ff5e315b7aeef180608eba9148154f47882749c976bd1169c273f5f99536")
    static let reenableUpdate = Self(images: [0x1f24c53cb4e3017, 0x1eb3de5ae3f0ef9, 0x1b65d0aadf5b09c, 0x120cc0f1c991055, 0x161f2658666e8cd],
        symbols: [[0x93223e2a55ee0ec3, 0xa28222bc8e4ccc5b]],
        salt: "e77b5df1564d26f431ef11c9e2e3fe9c41eca69ecb7aed7d6f7a39d33d425a7fc275c627944653de17ee7086234336fe1fc442b59dd6af53cbb8ead456759a")
}
