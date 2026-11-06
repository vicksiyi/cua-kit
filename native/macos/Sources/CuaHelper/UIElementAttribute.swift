import Foundation

// Native storage is one CFString reference. String construction bridges through
// Foundation; equality and hashing delegate to CoreFoundation's _CFObject
// conformances rather than Swift String normalization or pointer identity.
struct UIElementAttribute: Hashable {
    let name: CFString

    init(_ name: CFString) { self.name = name }
    init(_ name: String) { self.name = name as CFString }

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.name == rhs.name
    }

    func hash(into hasher: inout Hasher) {
        name.hash(into: &hasher)
    }
}

// Wrapper conversion precedes Set construction in the original cache builder.
// Keep this array boundary so callers that need original order retain it.
func decodedAXSupportedAttributes(_ names: CFArray?) -> [UIElementAttribute] {
    decodedAXAttributeNames(names).map(UIElementAttribute.init)
}
