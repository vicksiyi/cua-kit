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
        func arrayValue(for attribute: UIElementAttribute, index: Int, maxValues: Int, countIfKnown: Int?) -> (error: AXError, value: AXPartialValue?) { preconditionFailure() }
        func arrayCount(for attribute: UIElementAttribute) -> (error: AXError, count: Int) { preconditionFailure() }
        func isAttributeSettable(_ attribute: UIElementAttribute) throws -> Bool { preconditionFailure() }
        func setValue(_ value: AXEncodedValue, forAttribute attribute: UIElementAttribute) throws { preconditionFailure() }
        var supportedParameterizedAttributes: [UIElementAttribute] { preconditionFailure() }
        func parameterizedValue(for attribute: UIElementAttribute, parameter: AXEncodedValue) throws -> AXPartialValue? { preconditionFailure() }
        func element(at point: CGPoint) throws -> UIElement? { preconditionFailure() }
        var actions: [UIElementAction] { preconditionFailure() }
        func description(for action: UIElementAction) throws -> String? { preconditionFailure() }
        func perform(_ action: UIElementAction) throws { preconditionFailure() }
        var pid: Int32 { get throws { if shouldThrow { throw Failure.expected }; return -3 } }
        var actualPID: Int32 { get throws { if shouldThrow { throw Failure.expected }; return 42 } }
        var windowID: UInt32 { get throws { if shouldThrow { throw Failure.expected }; return UInt32.max } }
        var bundleIdentifier: String? { nil }
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
