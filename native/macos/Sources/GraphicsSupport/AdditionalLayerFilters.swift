import CoreGraphics

// Original GraphicsSupport field descriptors, Keys declarations and init bodies.
extension LayerFilter {
    public struct ColorSaturate: FilterConvertible {
        public static var name: Name { .colorSaturate }
        @Property public var amount: CGFloat
        public init(amount: CGFloat) {
            _amount = Property(wrappedValue: amount)
        }
        public init() { self.init(amount: 0) }
        public enum Keys: String, CaseIterable {
            case inputAmount
        }
        public func property(for key: Keys) -> WritableKeyPath<Self, any ErasableProperty> {
            switch key {
            case .inputAmount: return \.$amount
            }
        }
    }

    public struct LuminanceCurveMap: FilterConvertible {
        public static var name: Name { .luminanceCurveMap }
        @Property public var inputValues: [CGFloat]?
        @Property public var inputAmount: CGFloat?
        public init(inputValues: [CGFloat]?, inputAmount: CGFloat?) {
            _inputValues = Property(wrappedValue: inputValues)
            _inputAmount = Property(wrappedValue: inputAmount)
        }
        public init() { self.init(inputValues: nil, inputAmount: nil) }
        public enum Keys: String, CaseIterable {
            case inputValues
            case inputAmount
        }
        public func property(for key: Keys) -> WritableKeyPath<Self, any ErasableProperty> {
            switch key {
            case .inputValues: return \.$inputValues
            case .inputAmount: return \.$inputAmount
            }
        }
    }

    public struct LuminanceToAlpha: FilterConvertible {
        public static var name: Name { .luminanceToAlpha }
        @Property public var inputPremultipliedValues: Bool?
        public init(inputPremultipliedValues: Bool?) {
            _inputPremultipliedValues = Property(wrappedValue: inputPremultipliedValues)
        }
        public init() { self.init(inputPremultipliedValues: nil) }
        public enum Keys: String, CaseIterable {
            case inputPremultipliedValues
        }
        public func property(for key: Keys) -> WritableKeyPath<Self, any ErasableProperty> {
            switch key {
            case .inputPremultipliedValues: return \.$inputPremultipliedValues
            }
        }
    }

    public struct VariableBlur: FilterConvertible {
        public static var name: Name { .variableBlur }
        @Property public var radius: CGFloat
        @Property public var normalizeEdges: Bool?
        @Property public var inputFade: Bool?
        @Property public var inputSourceSublayerName: String?
        public init(radius: CGFloat, normalizeEdges: Bool?, inputFade: Bool?, inputSourceSublayerName: String?) {
            _radius = Property(wrappedValue: radius)
            _normalizeEdges = Property(wrappedValue: normalizeEdges)
            _inputFade = Property(wrappedValue: inputFade)
            _inputSourceSublayerName = Property(wrappedValue: inputSourceSublayerName)
        }
        public init() { self.init(radius: 0, normalizeEdges: nil, inputFade: nil, inputSourceSublayerName: nil) }
        public enum Keys: String, CaseIterable {
            case inputRadius
            case inputNormalizeEdges
            case inputFade
            case inputSourceSublayerName
        }
        public func property(for key: Keys) -> WritableKeyPath<Self, any ErasableProperty> {
            switch key {
            case .inputRadius: return \.$radius
            case .inputNormalizeEdges: return \.$normalizeEdges
            case .inputFade: return \.$inputFade
            case .inputSourceSublayerName: return \.$inputSourceSublayerName
            }
        }
    }

    public struct AlphaThreshold: FilterConvertible {
        public static var name: Name { .alphaThreshold }
        @Property public var amount: CGFloat
        @Property public var color: CGColor?
        public init(amount: CGFloat, color: CGColor?) {
            _amount = Property(wrappedValue: amount)
            _color = Property(wrappedValue: color)
        }
        public init() { self.init(amount: 0, color: nil) }
        public enum Keys: String, CaseIterable {
            case inputAmount
            case inputColor
        }
        public func property(for key: Keys) -> WritableKeyPath<Self, any ErasableProperty> {
            switch key {
            case .inputAmount: return \.$amount
            case .inputColor: return \.$color
            }
        }
    }

    // EmptyKeys.init(rawValue:) always returns nil; allCases is EmptyCollection.
    public struct EmptyKeys: RawRepresentable, CaseIterable {
        public var rawValue: String
        public init?(rawValue: String) { return nil }
        public static var allCases: EmptyCollection<Self> { EmptyCollection() }
    }

    public struct SDRNormalize: FilterConvertible {
        public typealias Keys = EmptyKeys
        public static var name: Name { .sdrNormalize }
        public init() {}
        public func property(for key: Keys) -> WritableKeyPath<Self, any ErasableProperty> {
            fatalError()
        }
    }
}
