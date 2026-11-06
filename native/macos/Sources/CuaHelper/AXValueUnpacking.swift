import ApplicationServices

// Recovered native AXValue unpacker at 0x1006ea098. System APIs retain ownership
// of the binary representation; this layer only selects the Swift result type.
func unpackAXValue(_ value: AXValue) throws -> Any? {
    try unpackAXValue(type: AXValueGetType(value)) { type, output in
        AXValueGetValue(value, type, output)
    }
}

// Factored only to exercise system-read failure and unknown-type branches.
func unpackAXValue(type: AXValueType, readValue: (AXValueType, UnsafeMutableRawPointer) -> Bool) throws -> Any? {
    func read<Value>(_ initial: Value) -> Value? {
        var result = initial
        let success = withUnsafeMutablePointer(to: &result) { pointer in
            readValue(type, UnsafeMutableRawPointer(pointer))
        }
        return success ? result : nil
    }
    // Pin the concrete buffer type before erasing to Any. Otherwise return-context
    // inference can select Any and the C API overwrites its existential metadata.
    switch type {
    case .cgPoint:
        let value: CGPoint? = read(CGPoint.zero)
        return value
    case .cgSize:
        let value: CGSize? = read(CGSize.zero)
        return value
    case .cgRect:
        let value: CGRect? = read(CGRect.zero)
        return value
    case .cfRange:
        let value: CFRange? = read(CFRange(location: 0, length: 0))
        return value
    case .axError:
        let value: AXError? = read(AXError.success)
        return value
    default: throw UIElementError.failedToUnwrapAttributeValue(AXValue.self)
    }
}
