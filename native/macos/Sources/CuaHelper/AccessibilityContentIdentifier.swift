// Identifier branch 0x100626b04..0x100626b68, append at 0x100627030.
extension AccessibilityContentAccumulator {
    mutating func appendIdentifier(_ identifier: String?) {
        guard let identifier, !identifier.isEmpty,
              !identifier.hasPrefix("_"), !identifier.hasPrefix("NS") else { return }
        appendUnique(.init(label: "ID", text: identifier))
    }
}
