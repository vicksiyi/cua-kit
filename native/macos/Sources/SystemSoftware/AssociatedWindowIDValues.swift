import Foundation

// Conversion stage of WindowServerSPI.associatedWindowIDs, 0x10026d114..0x10026d278.
// Original NSArray fast enumeration, conditional NSNumber cast, unsignedIntValue.
// This is the extracted conversion stage, not the optional SPI acquisition entry.
public func associatedWindowIDValues(_ values: NSArray) -> [UInt32] {
    var result: [UInt32] = []
    for value in values {
        guard let number = value as? NSNumber else { continue }
        result.append(number.uint32Value)
    }
    return result
}
