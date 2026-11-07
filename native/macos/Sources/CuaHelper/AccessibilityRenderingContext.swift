// Complete protocol descriptor 0x1012c95ac: Role: AccessibilityRole,
// mutable URL shortener (get/set/modify), and read-only context type.
// Concrete witnesses 0x100758848/54/5c address the stored shortener at +48;
// 0x100758870 reads the context type byte at +0.
protocol AccessibilityRenderingContext {
    associatedtype Role: AccessibilityRole
    var urlShortener: UIElementURLShortener { get set }
    var type: UIElementContextType { get }
}

extension UIElementTransformationContext: AccessibilityRenderingContext {
    typealias Role = UIElementRole
}
