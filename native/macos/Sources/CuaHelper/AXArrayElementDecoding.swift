// Recovered array transform at 0x1006ea28c. Its callback at 0x1006ea758 calls
// AXEncodedValue.unwrapped() for the target array's associated element type.
// The dyld-bound Swift standard-library operation is Sequence.compactMap.
func decodeAXArrayElements<Encoded, Element>(
    _ values: [Encoded],
    unwrapped: (Encoded) -> Element?
) -> [Element] {
    values.compactMap(unwrapped)
}
