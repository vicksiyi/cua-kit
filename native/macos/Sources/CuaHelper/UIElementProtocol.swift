import ApplicationServices

// Complete direct contract at 0x1012cd46c, including inherited ID/Role equality.
// Concrete conformance must supply the original provider/transaction behavior.
protocol UIElementProtocol: AccessibilityNode, Hashable where ID == AXUIElement, Role == UIElementRole {
    static var role: UIElementRole? { get }
    var axElement: AXUIElement { get }
    var cache: UIElementCache { get }
    init(element: AXUIElement)
    var subrole: String? { get }
    var isInsideWebView: Bool { get }
    var actions: [UIElementAction] { get }
    var actionDescriptions: [UIElementActionDescription] { get }
    func setValue(_ value: Any, forAttribute attribute: UIElementAttribute) throws
    func perform(action: UIElementAction) throws
}
