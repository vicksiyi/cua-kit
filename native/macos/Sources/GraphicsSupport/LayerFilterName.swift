extension LayerFilter {
    // Native descriptor 0x1012ec0ec, field record 0x101347f28.
    // filterType() awaits restoration of the remaining concrete filter types.
    public enum Name: String, CaseIterable {
        case colorSaturate
        case gaussianBlur
        case luminanceCurveMap
        case luminanceToAlpha
        case variableBlur
        case sdrNormalize
        case alphaThreshold
    }
}
