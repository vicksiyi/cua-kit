import ApplicationServices

// System result/control flow of 0x1006f63ec..<0x1006f6648. The caller supplies
// the provider-aware count query and correctly dispatched system copy operation.
func copiedAXArraySubset(
    index: Int, maxValues: Int, countIfKnown: Int?,
    readCount: () -> (error: AXError, count: Int),
    copy: (Int, Int, inout CFArray?) -> AXError
) -> (error: AXError, value: AXPartialValue?) {
    let total: Int
    if let known = countIfKnown {
        total = known
    } else {
        let result = readCount()
        guard result.error == .success else { return (result.error, nil) }
        total = result.count
    }
    var output: CFArray?
    let error = copy(index, maxValues, &output)
    guard let output else { return (error, nil) }
    let actual = CFArrayGetCount(output)
    // Even non-success copy status can carry a usable partial array. Native
    // comparison uses returned count, not index+count. Preserve checked addition.
    let ranges: [Range<Int>]? = actual < total ? [index..<(index + actual)] : nil
    return (error, AXPartialValue(value: AXEncodedValue(value: output),
        arraySubsetDescriptor: AXArraySubsetDescriptor(count: total, availableRanges: ranges),
        textTruncationDescriptor: nil))
}
