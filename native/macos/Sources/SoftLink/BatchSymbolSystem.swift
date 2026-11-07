/// Production composition of the recovered loaded-image, filesystem fallback,
/// and per-image symbol lookup stages. Injected sources remain available to tests.
extension BatchSymbolSources {
    static var system: Self {
        Self(loaded: { lookUpImages(images: $0, salt: $1) },
             filesystem: { loadImagesFromFilesystem(images: $0, salt: $1) },
             symbols: { lookUpSymbols(image: $0, symbols: $1, salt: $2) })
    }
}

public func lookUpBatchSymbolPointers(images: [UInt64], symbolRequests: [[UInt64]], salt: String)
    -> [(pointer: UnsafeRawPointer?, name: String?)] {
    lookUpBatchSymbolPointers(images: images, symbolRequests: symbolRequests, salt: salt, sources: .system)
}
