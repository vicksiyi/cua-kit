extension LayerFilter.GaussianBlur {
    // Native enum descriptor 0x1012ebf68, raw values 0x10102d3fc.
    public enum Keys: String, CaseIterable {
        case inputRadius
        case inputHardEdges
        case inputNormalizeEdges
    }

    // Original table 0x101513680 points to the three projected-property paths.
    public func property(for key: Keys) -> WritableKeyPath<Self, any LayerFilter.ErasableProperty> {
        switch key {
        case .inputRadius: return \.$radius
        case .inputHardEdges: return \.$hardEdges
        case .inputNormalizeEdges: return \.$normalizeEdges
        }
    }
}
