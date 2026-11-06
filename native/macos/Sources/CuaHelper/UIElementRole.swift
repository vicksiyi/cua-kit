import Foundation

// Native role identity uses CFString equality/hash, like UIElementAttribute,
// but remains a distinct type so role frequencies cannot mix with attributes.
struct UIElementRole: Hashable {
    let name: CFString

    init(_ name: CFString) { self.name = name }
    init(_ name: String) { self.name = name as CFString }

    var rawValue: String { name as String }

    static func == (lhs: Self, rhs: Self) -> Bool { lhs.name == rhs.name }
    func hash(into hasher: inout Hasher) { name.hash(into: &hasher) }
}
