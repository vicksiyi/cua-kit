import ApplicationServices
import Foundation

@main struct Test {
    enum Failure: Error { case expected }
    final class Mock: AXUIElementProtocol {
        var supportedAttributes: [UIElementAttribute] = []
        var output: (error: AXError, value: AXPartialValue?) = (.success, nil)
        var requested: [UIElementAttribute] = []
        var shouldThrow = false
        func value(for attribute: UIElementAttribute) -> (error: AXError, value: AXPartialValue?) {
            requested = [attribute]; return output
        }
        func values(for attributes: [UIElementAttribute]) throws -> [UIElementAttribute: AXPartialValue] {
            requested = attributes
            if shouldThrow { throw Failure.expected }
            return [:]
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
        var pid: Int32 { preconditionFailure() }
        var actualPID: Int32 { preconditionFailure() }
        var windowID: UInt32 { preconditionFailure() }
        var bundleIdentifier: String? { preconditionFailure() }
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
    static func main() throws {
        precondition(AXMockProviderStorage.current == nil)
        defer { AXMockProviderStorage.current = nil }
        let ax = AXUIElementCreateApplication(12000), other = AXUIElementCreateApplication(12001)
        let key = UIElementAttribute("AXValue"), mock = Mock()
        let provider = Provider(ax, mock)
        var systemCalls = 0
        func system() -> (error: AXError, value: AXPartialValue?) {
            systemCalls += 1; return (.noValue, nil)
        }
        _ = providerAXAttributeValue(ax, key, system: system)
        precondition(systemCalls == 1)
        AXMockProviderStorage.current = provider
        _ = providerAXAttributeValue(other, key, system: system)
        precondition(provider.lookups == 1 && systemCalls == 2)
        for error in [AXError.success, .cannotComplete, .attributeUnsupported] {
            mock.output = (error, nil)
            let result = providerAXAttributeValue(ax, key, system: system)
            precondition(result.error == error && result.value == nil)
        }
        let raw = NSObject()
        mock.output = (.failure, AXPartialValue(value: AXEncodedValue(value: raw),
            arraySubsetDescriptor: AXArraySubsetDescriptor(count: 7, availableRanges: [2..<4]),
            textTruncationDescriptor: AXTruncationDescriptor(count: 12, availableRange: 3..<8)))
        let result = providerAXAttributeValue(ax, key, system: system)
        precondition(result.error == .failure && result.value!.value.value === raw)
        precondition(result.value!.arraySubsetDescriptor == AXArraySubsetDescriptor(count: 7, availableRanges: [2..<4]))
        precondition(result.value!.textTruncationDescriptor == AXTruncationDescriptor(count: 12, availableRange: 3..<8))
        precondition(mock.requested == [key] && systemCalls == 2 && provider.lookups == 5)
        mock.supportedAttributes = [key, key]
        precondition(providerAXSupportedAttributes(ax, system: { preconditionFailure() }) == [key, key])
        let empty = try providerAXAttributeValues(ax, [key, key], system: { preconditionFailure() })
        precondition(empty.isEmpty && mock.requested == [key, key])
        mock.shouldThrow = true
        do {
            _ = try providerAXAttributeValues(ax, [key], system: { preconditionFailure() })
            preconditionFailure("expected mock failure")
        } catch Failure.expected {}
        AXMockProviderStorage.current = nil
        _ = providerAXAttributeValue(ax, key, system: system)
        precondition(systemCalls == 3 && provider.lookups == 8)
        print("Provider dispatch preserves misses, nil results, failures, identity and per-call lookup")
    }
}
