import ApplicationServices

// Concrete nonthrowing adapter for the native observation/input paths. Type-ID
// validation precedes the CF cast; value interpretation uses the recovered
// AXValue unpacker and requested-type conversion, not a parallel C decoder.
// This is not the complete generic AXEncodedValue dispatch.
func decodedAXTypedAttribute<Value>(_ raw: AnyObject, as type: Value.Type) -> Value? {
    guard CFGetTypeID(raw) == AXValueGetTypeID() else { return nil }
    return try? decodeAXValue(raw as! AXValue, throwingOnFailure: false, as: type)
}
