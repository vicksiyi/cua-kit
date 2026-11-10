extension LayerFilter {
    // Source protocol 0x1012ec080: Keys and its two associated conformances,
    // static name, init, and the projected-property writable key path.
    public protocol FilterConvertible {
        associatedtype Keys: CaseIterable & RawRepresentable where Keys.RawValue == String
        static var name: Name { get }
        init()
        func property(for key: Keys) -> WritableKeyPath<Self, any ErasableProperty>
    }
}

extension LayerFilter.FilterConvertible {
    public var name: LayerFilter.Name { Self.name }
}

extension LayerFilter.GaussianBlur: LayerFilter.FilterConvertible {
    public static var name: LayerFilter.Name { .gaussianBlur }

    // Source 0x10102dc94: radius0 and two Optional<Bool>.none tags (2,2).
    public init() { self.init(radius: 0, hardEdges: nil, normalizeEdges: nil) }
}
