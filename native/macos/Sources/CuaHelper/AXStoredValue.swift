import Foundation

// Native AXEncodedValue storage; init(wrapping: Any) is implemented in
// AXDynamicParameterEncoding.swift.
// Memberwise init(value:) accepts an already encoded system object; it must not
// replace the original parameter encoder for geometry, markers or UIElement.
struct AXEncodedValue {
    let value: AnyObject

    var valueIsString: Bool {
        CFGetTypeID(value) == CFStringGetTypeID()
    }
}

// Preserve both independent descriptors, including nil vs empty ranges.
// No defaults or truncation normalization are imposed at this storage boundary.
struct AXPartialValue {
    let value: AXEncodedValue
    let arraySubsetDescriptor: AXArraySubsetDescriptor?
    let textTruncationDescriptor: AXTruncationDescriptor?
}
