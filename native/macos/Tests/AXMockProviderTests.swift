import ApplicationServices
import Foundation

@main struct Test {
    typealias Failure = AXMockProviderFixture.Failure
    typealias Mock = AXMockProviderFixture.Mock
    typealias Provider = AXMockProviderFixture.Provider
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
        AXMockProviderStorage.current = provider
        mock.shouldThrow = false
        let pid = try providerAXProcessID(ax, system: { preconditionFailure() })
        let actual = try providerAXActualProcessID(ax, system: { preconditionFailure() })
        let window = try providerAXWindowID(ax, system: { preconditionFailure() })
        precondition(pid == -3 && actual == 42 && window == UInt32.max)
        precondition(providerAXBundleIdentifier(ax, readPID: { preconditionFailure() },
            applicationBundleIdentifier: { _ in preconditionFailure() }) == nil)
        mock.shouldThrow = true
        for read: () throws -> Void in [
            { _ = try providerAXProcessID(ax, system: { preconditionFailure() }) },
            { _ = try providerAXActualProcessID(ax, system: { preconditionFailure() }) },
            { _ = try providerAXWindowID(ax, system: { preconditionFailure() }) }
        ] {
            do { try read(); preconditionFailure("expected getter error") } catch Failure.expected {}
        }
        precondition(providerAXBundleIdentifier(other, readPID: { throw Failure.expected },
            applicationBundleIdentifier: { _ in preconditionFailure() }) == nil)
        precondition(providerAXBundleIdentifier(other, readPID: { -7 },
            applicationBundleIdentifier: { precondition($0 == -7); return "" }) == "")
        let copied = try copiedAXWindowID { precondition($0 == 0); $0 = 99; return .success }
        precondition(copied == 99)
        do {
            _ = try copiedAXWindowID { $0 = 99; return .cannotComplete }
            preconditionFailure("must not return output after error")
        } catch UIElementError.axError(let error) { precondition(error == .cannotComplete) }
        mock.shouldThrow = false
        let settable = try providerAXAttributeSettable(ax, key, system: { preconditionFailure() })
        precondition(!settable && mock.requested == [key])
        try providerAXSetAttribute(ax, AXEncodedValue(value: raw), for: key, system: { preconditionFailure() })
        precondition(mock.writtenValue === raw && mock.requested == [key])
        let actions = try providerAXActions(ax, system: { preconditionFailure() })
        precondition(actions == [.press, .press]) // Deduplication belongs to the OS branch only.
        let description = try providerAXActionDescription(ax, for: .press, system: { preconditionFailure() })
        precondition(description == nil && mock.lastAction == .press)
        try providerAXPerform(ax, .press, system: { preconditionFailure() })
        precondition(mock.operationCalls == ["settable", "write", "actions", "description", "perform"])
        mock.shouldThrow = true
        for operation: () throws -> Void in [
            { _ = try providerAXAttributeSettable(ax, key, system: { preconditionFailure() }) },
            { try providerAXSetAttribute(ax, AXEncodedValue(value: raw), for: key, system: { preconditionFailure() }) },
            { _ = try providerAXActions(ax, system: { preconditionFailure() }) },
            { _ = try providerAXActionDescription(ax, for: .press, system: { preconditionFailure() }) },
            { try providerAXPerform(ax, .press, system: { preconditionFailure() }) }
        ] {
            do { try operation(); preconditionFailure("expected operation failure") } catch Failure.expected {}
        }
        var performedFallback = false
        try providerAXPerform(other, .press, system: { performedFallback = true })
        precondition(performedFallback)
        for count: Int? in [nil, 0, -4, 10] {
            let subset = providerAXArrayValue(ax, for: key, index: -2, maxValues: -5, countIfKnown: count,
                system: { preconditionFailure() })
            precondition(subset.error == .failure && subset.value!.value.value === raw)
            precondition(subset.value!.arraySubsetDescriptor == result.value!.arraySubsetDescriptor)
            precondition(mock.arrayArguments!.index == -2 && mock.arrayArguments!.maxValues == -5 && mock.arrayArguments!.count == count)
        }
        let count = providerAXArrayCount(ax, for: key, system: { preconditionFailure() })
        precondition(count.error == .cannotComplete && count.count == -9)
        precondition(providerAXSupportedParameterizedAttributes(ax, system: { preconditionFailure() }) == [key, key])
        mock.shouldThrow = false
        let parameterized = try providerAXParameterizedValue(ax, for: key, parameter: AXEncodedValue(value: raw),
            system: { preconditionFailure() })
        precondition(parameterized!.value.value === raw && mock.writtenValue === raw)
        let precisePoint = CGPoint(x: 1.0000000001, y: -3.0000000001)
        let noHit = try providerAXElementAtPoint(precisePoint, in: ax, system: { preconditionFailure() })
        precondition(noHit == nil && mock.point == precisePoint) // No Float truncation on mock path.
        mock.hit = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [key], attributes: [:], transactionAttributes: [key]))
        let hit = try providerAXElementAtPoint(precisePoint, in: ax, system: { preconditionFailure() })
        precondition(CFEqual(hit!.axElement, ax) && hit!.cache.transactionAttributes == [key])
        mock.output = (.success, nil)
        let noValue = try providerAXParameterizedValue(ax, for: key, parameter: AXEncodedValue(value: raw), system: { preconditionFailure() })
        precondition(noValue == nil)
        mock.shouldThrow = true
        for query: () throws -> Void in [
            { _ = try providerAXParameterizedValue(ax, for: key, parameter: AXEncodedValue(value: raw), system: { preconditionFailure() }) },
            { _ = try providerAXElementAtPoint(precisePoint, in: ax, system: { preconditionFailure() }) }
        ] {
            do { try query(); preconditionFailure("expected query error") } catch Failure.expected {}
        }
        print("Provider dispatch preserves misses, nil results, failures, identity and per-call lookup")
    }
}
