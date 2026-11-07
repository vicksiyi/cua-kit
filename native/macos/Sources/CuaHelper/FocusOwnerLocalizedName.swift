// 0x100752244: requires both delimiters, skips trailing closing parentheses,
// then takes the suffix after the last opening parenthesis. No whitespace trim.
func focusOwnerNameFromLocalizedName(_ name: String) -> String? {
    guard name.contains("("), name.contains(")") else { return nil }
    var end = name.endIndex
    while end > name.startIndex, name[name.index(before: end)] == ")" { end = name.index(before: end) }
    guard let opening = name[..<end].lastIndex(of: "(") else { return nil }
    return String(name[name.index(after: opening)..<end])
}
