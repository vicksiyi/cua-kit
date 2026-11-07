import ApplicationServices
import Foundation

enum AXMockProviderFixture {
    enum Failure: Error { case expected }
    final class Mock: AXUIElementProtocol {
        var support: [UIElementAttribute] = []
        var supportReads = 0
        var batchReads = 0
        var batchOutput: [UIElementAttribute: AXPartialValue] = [:]
        var supportedAttributes: [UIElementAttribute] {
            get { supportReads += 1; return support }
            set { support = newValue }
        }
        var output: (error: AXError, value: AXPartialValue?) = (.success, nil)
        var requested: [UIElementAttribute] = []
        var shouldThrow = false
        var settableResult = false
        var actionsResult: [UIElementAction] = [.press, .press]
        var operationCalls: [String] = []
        var arrayArguments: (index: Int, maxValues: Int, count: Int?)?
        var point: CGPoint?
        var hit: UIElement?
        var writtenValue: AnyObject?
        var lastAction: UIElementAction?
        func checkOperation(_ name: String) throws {
            operationCalls.append(name)
            if shouldThrow { throw Failure.expected }
        }
        func value(for attribute: UIElementAttribute) -> (error: AXError, value: AXPartialValue?) {
            requested = [attribute]; return output
        }
        func values(for attributes: [UIElementAttribute]) throws -> [UIElementAttribute: AXPartialValue] {
            requested = attributes
            batchReads += 1
            if shouldThrow { throw Failure.expected }
            return batchOutput
        }
        static func == (a: Mock, b: Mock) -> Bool { a === b }
        func hash(into hasher: inout Hasher) { hasher.combine(ObjectIdentifier(self)) }
        func isEqual(to other: any AXUIElementProtocol) -> Bool { self === other }
        func arrayValue(for attribute: UIElementAttribute, index: Int, maxValues: Int, countIfKnown: Int?) -> (error: AXError, value: AXPartialValue?) {
            requested = [attribute]; arrayArguments = (index, maxValues, countIfKnown); return output
        }
        func arrayCount(for attribute: UIElementAttribute) -> (error: AXError, count: Int) { requested = [attribute]; return (.cannotComplete, -9) }
        func isAttributeSettable(_ attribute: UIElementAttribute) throws -> Bool { try checkOperation("settable"); requested = [attribute]; return settableResult }
        func setValue(_ value: AXEncodedValue, forAttribute attribute: UIElementAttribute) throws { try checkOperation("write"); writtenValue = value.value; requested = [attribute] }
        var supportedParameterizedAttributes: [UIElementAttribute] { support }
        func parameterizedValue(for attribute: UIElementAttribute, parameter: AXEncodedValue) throws -> AXPartialValue? { try checkOperation("parameterized"); requested = [attribute]; writtenValue = parameter.value; return output.value }
        func element(at point: CGPoint) throws -> UIElement? { try checkOperation("hit"); self.point = point; return hit }
        var actions: [UIElementAction] { get throws { try checkOperation("actions"); return actionsResult } }
        func description(for action: UIElementAction) throws -> String? { try checkOperation("description"); lastAction = action; return nil }
        func perform(_ action: UIElementAction) throws { try checkOperation("perform"); lastAction = action }
        var pid: Int32 { get throws { if shouldThrow { throw Failure.expected }; return -3 } }
        var actualPID: Int32 { get throws { if shouldThrow { throw Failure.expected }; return 42 } }
        var windowID: UInt32 { get throws { if shouldThrow { throw Failure.expected }; return UInt32.max } }
        var bundleIdentifier: String? = nil
    }
    final class Provider: AXMockProvider {
        let target: AXUIElement
        let mock: Mock
        var lookups = 0
        init(_ target: AXUIElement, _ mock: Mock) { self.target = target; self.mock = mock }
        func lookup(_ element: AXUIElement) -> (any AXUIElementProtocol)? {
            lookups += 1
            return CFEqual(element, target) ? mock : nil
        }
    }
}
