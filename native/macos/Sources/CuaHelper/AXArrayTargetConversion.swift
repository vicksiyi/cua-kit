// Final conversion after CFArray element decoding and compactMap. The source
// erases the decoded array to [Any], then casts to the requested array target.
// Target protocol checking and the preceding CFArray bridge are separate stages.
func convertedAXArray<Element, Target: TypeErasedArray>(
    _ decoded: [Element],
    as type: Target.Type,
    throwingOnFailure: Bool
) throws -> Target? {
    let erased: [Any] = decoded as [Any]
    if let converted = erased as? Target { return converted }
    if throwingOnFailure {
        // The inspected failure block passes the requested type twice.
        // Do not replace actual with the source array's dynamic type.
        throw UIElementError.unexpectedAttributeValueType(expected: type, actual: type)
    }
    return nil
}

// Initial eligibility check at 0x1006e9690, before element conversion. A CFArray
// does not imply that Any, Optional<Array<...>> or an unrelated target qualifies.
func resolvedAXArrayTarget(_ requested: Any.Type, throwingOnFailure: Bool) throws -> (any TypeErasedArray.Type)? {
    if let target = requested as? any TypeErasedArray.Type { return target }
    if throwingOnFailure {
        throw UIElementError.unexpectedAttributeValueType(expected: [Any].self, actual: requested)
    }
    return nil
}
