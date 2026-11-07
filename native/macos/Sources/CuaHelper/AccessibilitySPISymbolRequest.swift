// Extracted from the pinned native image, initializers 0x10025587c and 0x100255bac.
// These salts are static hash suffixes, not credentials.
struct AccessibilitySPISymbolRequest {
    let images: [UInt64]
    let symbols: [[UInt64]]
    let salt: String
}
extension AccessibilitySPISymbolRequest {
    static let functions = Self(
        images: [0x000d32ba7d212c27, 0x00e43b4071c29828, 0x0068b9bd860602db, 0x0009547b42d2d523, 0x00372e029c5525cb, 0x007a2616c0e193a3, 0x0099c70b8b0bfcd2, 0x0015ddca0d045f95, 0x0058a95cffccfad1, 0x004d734fb627dd83, 0x005ad709e3c9fc72, 0x0097dfdcbbcc140c, 0x00d3522670a25526, 0x007ee0ac4229be35, 0x0077ffa5a377c8fa, 0x001b2d21c54636a6, 0x0028e313b13972d3, 0x00ffcd301e958691, 0x00959131c0a4bd8e, 0x00c0e5819ed87df7, 0x00bbc7be856ed836, 0x00d7486c1f9895b3, 0x004b6812e8c17a06, 0x002162aa0737eeff, 0x0051b08d0061f4e9, 0x00f680ebbbe54c27, 0x005a46744941ba49, 0x0025586bc812a6dc, 0x00f2d3fb3564a380, 0x006301dbca5d2122],
        symbols: [
            [0x1e94ed0f70010e44, 0x2a01ed0fb5ba3b71],
            [0xb6087ea3ebef8d89, 0x5541af1c8e026403],
            [0x71d9c61b40a177dd, 0xe8911237574d4b79]
        ],
        salt: "265d8bb12ebae9d18f499027f45b956c57e0db256bd6439995dc2841def81858941c2d2489dc6a99451cf7964d8bda3cb8e7edf97cd938c5d510adb28a60ee")
    static let keys = Self(
        images: [0x00e236f60e8a8ccb, 0x00c1f1ccf1d75baa, 0x00f753d5b2918b96, 0x0025c95b0ac71ce8, 0x0071aa0a8fb2890a, 0x008df3c973b072ff, 0x00dcc5d1d20a63f6, 0x00999b848f19794b, 0x007f5a53345fd1d9, 0x000df4917f5d8f17, 0x00cf8061fe60f342, 0x0064fcec1592fb91, 0x0068d74e0eb11cc8, 0x00284930a34ca807, 0x001f6eec09fc9878, 0x00428c5ad6e2a511, 0x00d1cd7bd90ae084, 0x008418d5d817f0d3, 0x00d304728e736243, 0x00a3deff4aab6fc4, 0x006afbe1a9a780f8, 0x00d21b23adc03325, 0x0076bd51122c4b28, 0x002631b4758fc793, 0x00277fa91906c5a6, 0x0062bca79b655946, 0x001d4ddf8d4cb54a, 0x00a20f55bdf40c1e, 0x0051455276d4e05f, 0x00c03e90df94a3fd],
        symbols: [
            [0xa485b4d5ef6209f6, 0x9ee00f3ede3e6011],
            [0x6a8859bf85d3c050, 0x15e8081326fbcf08],
            [0x125347bd8ed7a8de, 0xab6aaacb385377d3],
            [0x582d8ccaebf737a3, 0x4f931267defa507e],
            [0x7818b4a5ed1ffd56, 0xa6a02c5717a453f9],
            [0x9d9e8ee7386a7dde, 0xbb30f32764d4cfe5],
            [0x77f7f4622292307c, 0xaf3d45c6a921ce57]
        ],
        salt: "9ec9cab298db6711c76a452f759d294718edcdf4628d8dcec647e77ea04b2286bb201b6f34d4dbd8858707ae40619a2b26658d3ac57c99dab6dc95b5f742b598")
}
