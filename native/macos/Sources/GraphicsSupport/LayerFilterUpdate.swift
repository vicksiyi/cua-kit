import QuartzCore

extension CALayer {
    // Native 0x10102bc88: match by concrete Swift type. A present value replaces
    // only the first match; nil removes all matches. Preserve the fresh getter
    // used by the original computed-property mutation after the search.
    public func updateFilter<Filter: LayerFilter.FilterConvertible>(
        _ filter: Filter?, creatingIfNeeded: Bool
    ) {
        if let filter {
            if let index = layerFilters.firstIndex(where: { $0 is Filter }) {
                layerFilters[index] = filter
            } else if creatingIfNeeded {
                layerFilters.append(filter)
            }
        } else {
            layerFilters.removeAll { $0 is Filter }
        }
    }
}
