import Foundation

extension LayerFilter.FilterConvertible {
    // Restored parameter application from 0x10102b6b4..0x10102b998.
    // Explicit seam for checking parameter application independently of the
    // platform binding used by the zero-argument makeFilterInstance entry.
    public func makeFilterInstance(using factory: (LayerFilter.Name) -> NSObject?) -> NSObject? {
        guard let instance = factory(Self.name) else { return nil }
        for key in Keys.allCases {
            // Keep Optional.none boxed inside Any as NSNull; only absence of
            // the erased property itself becomes nil at the Objective-C call.
            let value = self[keyPath: property(for: key)].erased.map { $0 as AnyObject }
            instance.setValue(value, forKey: key.rawValue)
        }
        return instance
    }
}
