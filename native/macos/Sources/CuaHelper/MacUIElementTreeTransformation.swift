// Descriptor 0x1012ccdc8. Shared payload wraps the common nine-case policy.
// Native-specific policy execution is restored separately.
enum MacUIElementTreeTransformation: Equatable {
    case shared(UIElementTreeTransformation)
    case filterActions
    case removeElementsUnderCalendarEvents
    case retrieveAttributedTextFromTextAreas
    case retrieveAttributedTextFromWebAreas

    // 0x10075b7a0 wraps the current common pipeline, then concatenates the
    // static prefix [9] and suffix [10, 11, 12]. Do not cache this computed list.
    static var defaultPipeline: [Self] {
        [.filterActions] + UIElementTreeTransformation.defaultPipeline.map(Self.shared) + [
            .removeElementsUnderCalendarEvents,
            .retrieveAttributedTextFromTextAreas,
            .retrieveAttributedTextFromWebAreas,
        ]
    }
}
