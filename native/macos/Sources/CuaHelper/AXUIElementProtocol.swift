import ApplicationServices

// Class-bound protocol at 0x1012cc520, distinct from UIElementProtocol.
// Its AXUIElement witness table is 0x10149b1b8. The optional mock provider
// resolves an AX reference to this interface before the system path is chosen.
protocol AXUIElementProtocol: AnyObject, Hashable {
    var supportedAttributes: [UIElementAttribute] { get }
    func value(for attribute: UIElementAttribute) -> (error: AXError, value: AXPartialValue?)
    func values(for attributes: [UIElementAttribute]) throws -> [UIElementAttribute: AXPartialValue]
    func arrayValue(for attribute: UIElementAttribute, index: Int, maxValues: Int,
                    countIfKnown: Int?) -> (error: AXError, value: AXPartialValue?)
    func arrayCount(for attribute: UIElementAttribute) -> (error: AXError, count: Int)
    func isAttributeSettable(_ attribute: UIElementAttribute) throws -> Bool
    func setValue(_ value: AXEncodedValue, forAttribute attribute: UIElementAttribute) throws
    var supportedParameterizedAttributes: [UIElementAttribute] { get }
    func parameterizedValue(for attribute: UIElementAttribute, parameter: AXEncodedValue) throws -> AXPartialValue?
    func element(at point: CGPoint) throws -> UIElement?
    var actions: [UIElementAction] { get }
    func description(for action: UIElementAction) throws -> String?
    func perform(_ action: UIElementAction) throws
    var pid: Int32 { get throws }
    var actualPID: Int32 { get throws }
    var windowID: UInt32 { get throws }
    var bundleIdentifier: String? { get }
    func isEqual(to other: any AXUIElementProtocol) -> Bool
}
