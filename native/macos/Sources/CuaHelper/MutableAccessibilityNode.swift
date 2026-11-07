import Foundation

// Descriptor 0x1012c93a0: one inherited conformance, seven setter/modify
// pairs for inherited properties, then transformedString getter/setter/modify.
protocol MutableAccessibilityNode: AccessibilityNode {
    var role: Role { get set }
    var roleDescription: String? { get set }
    var title: String? { get set }
    var description: String? { get set }
    var value: String? { get set }
    var isFocusable: Bool { get set }
    var url: URL? { get set }
    var transformedString: TransformedUIString? { get set }
}

// Native witnesses 0x1007620f8..<0x100762324 mutate stored fields only.
// No AX writes, capability recomputation or cache invalidation at this layer.
extension TransformedUIElement: MutableAccessibilityNode {}
