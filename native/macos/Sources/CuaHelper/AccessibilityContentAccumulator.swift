// Restores the two captured collections used by 0x100626300: an ordered entry
// array and a separate Set<String>. Labels do not participate in deduplication.
struct AccessibilityContentAccumulator {
    private(set) var entries: [AccessibilityContentEntry] = []
    private var seenText: Set<String> = []

    func contains(text: String) -> Bool { seenText.contains(text) }

    // 0x100627930. First occurrence wins; caller decides whether empty text is
    // eligible. Swift String equality includes canonical Unicode equivalence.
    mutating func appendUnique(_ entry: AccessibilityContentEntry) {
        guard !seenText.contains(entry.text) else { return }
        seenText.insert(entry.text)
        entries.append(entry)
    }

    // 0x100627b88 appends directly to the entry array, bypassing the text set.
    mutating func appendIndexRange(label: String, range: ClosedRange<Int>?) {
        guard let entry = AccessibilityContentEntry.indexRange(label: label, range: range) else { return }
        entries.append(entry)
    }
}
