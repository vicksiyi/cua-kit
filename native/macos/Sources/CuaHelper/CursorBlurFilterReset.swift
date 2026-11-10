// Cursor Window filter restoration 0x100095580..0x100095724. Nil means
// the content-view layer is absent. An existing layer is written back even
// when no GaussianBlur was present; all other filters keep their order.
func resetCursorBlurFilters<Filter>(readFilters: () -> [Filter]?,
    isGaussianBlur: (Filter) -> Bool, writeFilters: ([Filter]) -> Void
) {
    guard var filters = readFilters() else { return }
    filters.removeAll(where: isGaussianBlur)
    writeFilters(filters)
}
