public struct WindowServerCaptureOptions: OptionSet {
    public let rawValue: UInt32
    public init(rawValue: UInt32) { self.rawValue = rawValue }
    // Native getter0x10026be38.
    public static let ignoreGlobalClipShape = Self(rawValue: 0x800)
}
