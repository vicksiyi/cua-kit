import ApplicationServices

// UIElementProtocol.count(for:), 0x1007b06a0..<0x1007b0828.
// The support check precedes even a cached value. A subset descriptor reports
// the full count; without it the raw CFArray is counted without element decode.
func uiElementCount(
    isKnownUnsupported: () -> Bool,
    cachedValue: () -> AXPartialValue?,
    readArrayCount: () -> (error: AXError, count: Int)
) throws -> Int? {
    guard !isKnownUnsupported() else { return nil }
    if let partial = cachedValue() {
        if let subset = partial.arraySubsetDescriptor { return subset.count }
        let raw = partial.value.value
        guard CFGetTypeID(raw) == CFArrayGetTypeID() else { return 0 }
        return CFArrayGetCount(raw as! CFArray)
    }
    let result = readArrayCount()
    guard result.error == .success else { throw UIElementError.axError(result.error) }
    return result.count
}
