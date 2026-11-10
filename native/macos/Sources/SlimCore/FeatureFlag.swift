// Recovered FeatureFlag storage (two Strings and a Bool). This registry is
// partial; it does not implement the vendor's global test override/cache owner.
public struct FeatureFlag {
    public var key: String
    public var description: String
    public var defaultValue: Bool

    public init(key: String, description: String, defaultValue: Bool) {
        self.key = key
        self.description = description
        self.defaultValue = defaultValue
    }

    // Normal resolution branch0x100fbfab0..0x100fbfb80: an absent or
    // non-Bool override retains the flag's default. Supply the store explicitly.
    public func isEnabled(readOverride: (String) -> Any?) -> Bool {
        readOverride(key) as? Bool ?? defaultValue
    }

    // Pinned static storage0x10150be80, including the true default byte+0x20.
    public static var computerUseCursor = Self(key: "feature/computerUseCursor",
        description: "Enable the virtual cursor in Computer Use.", defaultValue: true)

    // Static storage0x10150c060; true default byte at+0x20.
    public static var axTreeDiffingRemovedElementIDRanges = Self(
        key: "feature/axTreeDiffingRemovedElementIDRanges",
        description: "Summarizes removed AX tree elements as consolidated ID ranges in diff rendering.",
        defaultValue: true)
}
