import ApplicationServices

extension TransformedUIElement: Hashable {
    // Equatable witness 0x100762784 calls the same provider-aware AX identity
    // comparator as UIElement. Rendered/captured attributes are not compared.
    static func == (lhs: Self, rhs: Self) -> Bool {
        providerAXElementsEqual(lhs.axElement, rhs.axElement)
    }

    // Hashable witness 0x10076236c uses CFHash of the original AX handle,
    // without substituting a provider mock or hashing transformed fields.
    func hash(into hasher: inout Hasher) {
        hasher.combine(CFHash(axElement))
    }
}
