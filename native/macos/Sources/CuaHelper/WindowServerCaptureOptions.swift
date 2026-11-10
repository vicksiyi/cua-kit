struct WindowServerCaptureOptions: OptionSet {
    let rawValue: UInt32
    init(rawValue: UInt32) { self.rawValue = rawValue }
    // Native getter0x10026be38.
    static let ignoreGlobalClipShape = Self(rawValue: 0x800)
}
