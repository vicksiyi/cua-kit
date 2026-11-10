import Foundation
import CoreGraphics

// 0x10026d4cc..0x10026d6c8: enumerate ALL NSNumber values, then choose first
// finite nonnegative CGFloat. Preserve negative zero; no maximum or averaging.
public func resolvedCornerRadiusValue(_ values: NSArray) -> CGFloat? {
    var radii: [CGFloat] = []
    for value in values {
        guard let number = value as? NSNumber else { continue }
        let radius = CGFloat(truncating: number)
        if radius.isFinite && radius >= 0 { radii.append(radius) }
    }
    return radii.first
}

// Extracted query composition26d450..26d4b8, injectable without private SPI.
public func queryResolvedCornerRadius<Query, Iterator>(forWindow id: UInt32,
    mainConnection: () -> OpaquePointer?,
    query: (OpaquePointer?, NSArray, UInt32) -> Query?,
    makeIterator: (Query) -> Iterator?, count: (Iterator) -> UInt32,
    windowID: (Iterator, UInt32) -> UInt32,
    radii: (Iterator, UInt32) -> NSArray?
) -> CGFloat? {
    let windows: NSArray = [NSNumber(value: id)]
    defer { withExtendedLifetime(windows) {} }
    guard let queryResult = query(mainConnection(), windows, 0) else { return nil }
    defer { withExtendedLifetime(queryResult) {} }
    guard let iterator = makeIterator(queryResult) else { return nil }
    defer { withExtendedLifetime(iterator) {} }
    let total = count(iterator)
    for index in 0..<total {
        if windowID(iterator, index) == id {
            guard let values = radii(iterator, index) else { return nil }
            return resolvedCornerRadiusValue(values)
        }
    }
    return nil
}
