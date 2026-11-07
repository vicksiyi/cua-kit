import ApplicationServices

extension UIElementProtocol {
    // 0x1007ad500 directly forwards the axElement getter witness.
    var id: AXUIElement { axElement }

    // 0x1007ad47c reads left then right AX references and calls 0x1006fb9ac.
    // Cached attributes are not part of identity.
    static func == (lhs: Self, rhs: Self) -> Bool {
        providerAXElementsEqual(lhs.axElement, rhs.axElement)
    }

    // 0x1007ab548: CFHash(original AX reference), then Hasher._combine(UInt).
    // UInt.hash(into:) via combine preserves this operation without using SPI.
    // Provider replacement is intentionally not consulted by the source hash.
    func hash(into hasher: inout Hasher) {
        hasher.combine(CFHash(axElement))
    }
}
