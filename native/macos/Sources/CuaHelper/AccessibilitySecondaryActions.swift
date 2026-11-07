// Native 0x100626b70..0x100626d8c and predicate 0x100627d14.
// These are static exclusions, not the content accumulator's seen-text set.
extension AccessibilityContentAccumulator {
    mutating func appendSecondaryActions<Actions: Sequence>(_ actions: Actions)
    where Actions.Element == AccessibilityPresentationAction {
        let excludedKinds: Set<AccessibilityPresentationAction.Kind> = [.press, .showMenu, .scrollToVisible]
        let excludedDescriptions: Set<String> = [
            "Add comment", "Remove unused rows", "Remove unused columns",
            "Remove unused rows and columns",
        ]
        let retained = actions.filter {
            !excludedKinds.contains($0.kind) && !excludedDescriptions.contains($0.description)
        }
        guard !retained.isEmpty else { return }
        appendUnique(.init(label: "Secondary Actions", text: retained.map(\.description).joined(separator: ", ")))
    }
}
