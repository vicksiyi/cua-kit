import ApplicationServices

// Recovered from AccessibilitySupport.UIElementError field metadata.
// Keep native AX errors and Swift metatypes intact; do not flatten them into
// transport messages before the decoder's throwing/nonthrowing policy runs.
// The full decoder and its transport mapping are not restored yet.
enum UIElementError: Error {
    case axError(AXError)
    case unexpectedAttributeValueType(expected: Any.Type, actual: Any.Type)
    case failedToUnwrapAttributeValue(Any.Type)
    case failedInit(String)
    case failedToWrapAXValue
}
