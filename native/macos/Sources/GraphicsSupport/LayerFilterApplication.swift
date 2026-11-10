import QuartzCore

extension CALayer {
    // Extracted setter body 0x10102a564, used by layerFilters.
    // Preserve input order and duplicates; omit failed factories and always
    // replace filters, including with a non-nil empty array.
    public func setLayerFilters(_ values: [any LayerFilter.FilterConvertible]) {
        filters = values.compactMap { $0.makeFilterInstance() }
    }
}
