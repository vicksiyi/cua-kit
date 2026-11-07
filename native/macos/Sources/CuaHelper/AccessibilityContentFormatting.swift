// Finalization in 0x100626ddc..0x100627008. The long/multiline flag controls
// ordering, not truncation or insertion of extra line breaks.
func formatAccessibilityContent(_ entries: [AccessibilityContentEntry]) -> String {
    guard !entries.isEmpty else { return "" }
    if entries.count == 1, entries[0].label != "Secondary Actions" {
        return entries[0].text
    }
    // Short entries precede long/multiline entries. Preserve order within each
    // class (native insertion-sort path 0x100627e0c only swaps true then false).
    let ordered = entries.filter { !$0.isLongOrMultiline } + entries.filter { $0.isLongOrMultiline }
    return ordered.map { entry in
        if let label = entry.label { return label + ": " + entry.text }
        return entry.text
    }.joined(separator: ", ")
}
