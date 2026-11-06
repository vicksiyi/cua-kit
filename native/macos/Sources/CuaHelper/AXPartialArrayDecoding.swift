// AXPartialValue.decodedArray at 0x1006fac44. The closure is the still-separate
// AXEncodedValue.unwrapped<[Element]>() boundary, not an alternative CF decoder.
func decodedAXPartialArray<Element>(
    subsetDescriptor: AXArraySubsetDescriptor?,
    decode: () -> [Element]?
) -> (array: [Element], subsetDescriptor: AXArraySubsetDescriptor?)? {
    guard let array = decode() else { return nil }
    return (array, subsetDescriptor)
}
