extension LayerFilter {
    public protocol ErasableProperty {
        var erased: Any? { get set }
    }

    // Source 0x10102c608..0x10102c904. Wrong erased value types are ignored;
    // replacing the projection requires the same concrete Property<Value> type.
    @propertyWrapper
    public struct Property<Value>: ErasableProperty {
        public var wrappedValue: Value
        public init(wrappedValue: Value) { self.wrappedValue = wrappedValue }
        public var erased: Any? {
            get { wrappedValue as Any }
            set { if let value = newValue as? Value { wrappedValue = value } }
        }
        public var projectedValue: any ErasableProperty {
            get { self }
            set { self = newValue as! Self }
        }
    }
}
