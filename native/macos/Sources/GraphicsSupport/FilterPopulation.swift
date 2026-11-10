import Foundation

extension LayerFilter.FilterConvertible {
    // Native 0x10102af34: copy the receiver, enumerate keys, skip absent KVC-path
    // values, and assign present values through the erased projected property.
    // The Property<Value> cast governs type acceptance, not this routine.
    public func populated(from instance: NSObject) -> Self {
        var result = self
        for key in Keys.allCases {
            if let value = instance.value(forKeyPath: key.rawValue) {
                result[keyPath: property(for: key)].erased = value
            }
        }
        return result
    }
}
