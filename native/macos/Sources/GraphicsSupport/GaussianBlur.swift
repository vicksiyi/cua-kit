import CoreGraphics

extension LayerFilter {
    // Storage descriptor 0x1012ebf4c: three Property wrappers.
    // CAFilter conversion is supplied by the shared FilterConvertible extension.
    public struct GaussianBlur {
        @Property public var radius: CGFloat
        @Property public var hardEdges: Bool?
        @Property public var normalizeEdges: Bool?

        public init(radius: CGFloat, hardEdges: Bool?, normalizeEdges: Bool?) {
            _radius = Property(wrappedValue: radius)
            _hardEdges = Property(wrappedValue: hardEdges)
            _normalizeEdges = Property(wrappedValue: normalizeEdges)
        }
    }
}
