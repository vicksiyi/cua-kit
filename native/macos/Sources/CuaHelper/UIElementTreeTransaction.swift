// Native immutable fields: protocol root, Cache and FrequencyTable<UIElementRole>.
// Construction/prefetch is separate; this restores the complete scoped value.
struct UIElementTreeTransaction {
    let element: any UIElementProtocol
    let cache: UIElementTransactionCache
    let roleFrequencyTable: FrequencyTable<UIElementRole>

    @TaskLocal static var current: UIElementTreeTransaction? = nil
    @TaskLocal static var prefetchEnabled: Bool = true

    // 0x10076c8e8: install the whole transaction for synchronous throwing work.
    // TaskLocal restores the preceding value on both normal and throwing exit.
    func perform<Result>(work: (any UIElementProtocol) throws -> Result) rethrows -> Result {
        try Self.$current.withValue(self) { try work(element) }
    }
}
