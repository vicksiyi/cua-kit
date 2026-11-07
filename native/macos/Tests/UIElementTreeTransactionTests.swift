import Foundation
import ApplicationServices
import os

@main struct Test {
    enum Failure: Error { case expected }
    struct Element: UIElementProtocol {
        let axElement: AXUIElement
        let cache: UIElementCache
        init(element: AXUIElement) {
            axElement = element
            cache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
        }
        init(element: AXUIElement, cache: UIElementCache) {
            axElement = element; self.cache = cache
        }
        static var role: UIElementRole? { nil }
        var role: UIElementRole { .group }
        var id: AXUIElement { axElement }
        var subrole: String? { nil }
        var isInsideWebView: Bool { false }
        var actions: [UIElementAction] { [] }
        var actionDescriptions: [UIElementActionDescription] { [] }
        var roleDescription: String? { nil }
        var title: String? { nil }
        var description: String? { nil }
        var value: String? { nil }
        var identifier: String? { nil }
        var isSelected: Bool { false }
        var isSelectable: Bool { false }
        var isFocused: Bool { false }
        var isFocusable: Bool { false }
        var isEnabled: Bool { false }
        var isValueSettable: Bool { false }
        func setValue(_ value: Any, forAttribute: UIElementAttribute) throws { preconditionFailure("fixture has no operations") }
        func perform(action: UIElementAction) throws { preconditionFailure("fixture has no operations") }
        static func == (lhs: Self, rhs: Self) -> Bool { CFEqual(lhs.axElement, rhs.axElement) }
        func hash(into hasher: inout Hasher) { hasher.combine(CFHash(axElement)) }
    }
    static func transaction(_ pid: pid_t) -> UIElementTreeTransaction {
        var frequencies = FrequencyTable<UIElementRole>(); frequencies.increment(.group)
        return UIElementTreeTransaction(element: Element(element: AXUIElementCreateApplication(pid)),
            cache: UIElementTransactionCache(attributeTable: [:], requestedAttributes: [],
                fallbackElements: UIElementFallbackCache(initialState: [:])), roleFrequencyTable: frequencies)
    }
    static func checkScopedConstruction() {
        let ax = AXUIElementCreateApplication(11002)
        let first = transaction(11003), second = transaction(11004)
        var reads = 0
        func construct() -> UIElement {
            UIElement(element: ax) { element, snapshot in
                constructUIElementCache(element: element, transaction: snapshot,
                    readSupported: { reads += 1; return [] },
                    bundleIdentifier: { preconditionFailure("empty support cannot query bundle") },
                    readValues: { _ in preconditionFailure("empty support cannot read values") })
            }
        }
        _ = construct(); _ = construct()
        precondition(reads == 2) // Outside a transaction there is no shared fallback.
        first.perform { _ in
            let firstElement = construct()
            precondition(CFEqual(firstElement.axElement, ax) && reads == 3)
            _ = construct(); precondition(reads == 3)
            second.perform { _ in
                _ = construct(); precondition(reads == 4)
                _ = construct(); precondition(reads == 4)
            }
            _ = construct(); precondition(reads == 4)
            // Reading the owner precedes cache construction. A nested scope in
            // the constructor must not change the snapshot already selected.
            _ = UIElement(element: ax) { element, snapshot in
                second.perform { _ in
                    precondition(fallbackUIElementCache(element: element, in: snapshot!.fallbackElements) != nil)
                    let other = AXUIElementCreateApplication(11005)
                    storeFallbackUIElementCache(element: other, supportedAttributes: [],
                        attributes: [:], in: snapshot!.fallbackElements)
                    precondition(fallbackUIElementCache(element: other, in: first.cache.fallbackElements) != nil)
                    precondition(fallbackUIElementCache(element: other, in: second.cache.fallbackElements) == nil)
                }
                return firstElement.cache
            }
        }
        _ = construct(); precondition(reads == 5)
        precondition(UIElementTreeTransaction.current == nil)
    }
    static func checkSubtreeConstruction() {
        let ax = AXUIElementCreateApplication(11006)
        let child = AXUIElementCreateApplication(11007)
        let role = UIElementAttribute("AXRole"), extra = UIElementAttribute("AXExtra")
        let roleValue = AXPartialValue(value: AXEncodedValue(value: "AXButton" as NSString),
            arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        var events: [String] = []
        func construct() -> UIElementTreeTransaction {
            constructUIElementSubtreeTransaction(element: ax, additionalAttributes: [extra, extra],
                maxChildCount: -3,
                supportedAttributes: { events.append("support"); return [] },
                bundleIdentifier: { preconditionFailure("DOM class not supported") },
                readHierarchy: { element, arrays, requested, limit in
                    events.append("hierarchy")
                    precondition(UIElementTreeTransaction.current == nil)
                    precondition(CFEqual(element, ax) && limit == -3)
                    precondition(arrays.map { $0.name as String } == ["AXChildren", "AXSelectedRows", "AXSelectedCells", "AXSelectedChildren"])
                    precondition(requested.filter { $0 == extra }.count == 2)
                    return [ax: [role: roleValue], child: [role: roleValue]]
                }, makeElement: { element, cache in
                    events.append("root")
                    precondition(UIElementTreeTransaction.current == nil)
                    let concreteCache = constructUIElementCache(element: element, transaction: cache,
                        readSupported: { events.append("cold"); return [] },
                        bundleIdentifier: { preconditionFailure() }, readValues: { _ in preconditionFailure() })
                    return Element(element: element, cache: concreteCache)
                })
        }
        let enabled = construct()
        precondition(events == ["support", "hierarchy", "root"])
        precondition(enabled.roleFrequencyTable[.button] == 2)
        precondition(enabled.cache.requestedAttributes.contains(extra))
        precondition(enabled.element.cache.transactionAttributes == enabled.cache.requestedAttributes)
        precondition(enabled.element.cache.attributes[role] != nil)
        precondition(enabled.cache.requestedAttributes.contains(UIElementAttribute("AXChildren")))
        events = []
        let disabled = UIElementTreeTransaction.$prefetchEnabled.withValue(false) { construct() }
        precondition(events == ["root", "cold"])
        precondition(disabled.cache.attributeTable.isEmpty && disabled.cache.requestedAttributes.isEmpty)
        precondition(disabled.roleFrequencyTable[.button] == 0)
        precondition(disabled.element.cache.transactionAttributes == nil)
        precondition(fallbackUIElementCache(element: ax, in: disabled.cache.fallbackElements) != nil)
        precondition(fallbackUIElementCache(element: ax, in: enabled.cache.fallbackElements) == nil)
        precondition(UIElementTreeTransaction.prefetchEnabled)
    }
    static func checkProviderInitializer() {
        let ax = AXUIElementCreateApplication(12010)
        let mock = AXMockProviderFixture.Mock()
        let provider = AXMockProviderFixture.Provider(ax, mock)
        precondition(AXMockProviderStorage.current == nil)
        AXMockProviderStorage.current = provider
        defer { AXMockProviderStorage.current = nil }
        let role = UIElementAttribute("AXRole")
        mock.supportedAttributes = [role]
        mock.batchOutput = [role: AXPartialValue(value: AXEncodedValue(value: "AXButton" as NSString),
            arraySubsetDescriptor: nil, textTruncationDescriptor: nil)]
        precondition(readAXSupportedParameterizedAttributes(ax) == [role])
        let parameter = NSObject()
        let queried = try! readAXParameterizedValue(ax, for: role, parameter: AXEncodedValue(value: parameter))
        precondition(queried == nil && mock.writtenValue === parameter)
        let hit = try! readAXElementAtPoint(CGPoint(x: 0.123456789, y: -9), in: ax)
        precondition(hit == nil && mock.point == CGPoint(x: 0.123456789, y: -9))
        let cold = UIElement(element: ax)
        precondition(cold.role == .button && mock.supportReads == 1 && mock.batchReads == 1)
        let owner = transaction(12011)
        owner.perform { _ in
            let first = UIElement(element: ax)
            precondition(first.role == .button && mock.supportReads == 2 && mock.batchReads == 2)
            mock.batchOutput = [:]
            let second = UIElement(element: ax)
            precondition(second.role == .button && mock.supportReads == 2 && mock.batchReads == 2)
        }
        let after = UIElement(element: ax)
        precondition(after.role == .unknown && mock.supportReads == 3 && mock.batchReads == 3)
        let prefetched = UIElementTreeTransaction(element: Element(element: ax),
            cache: UIElementTransactionCache(attributeTable: [ax: cold.cache.attributes],
                requestedAttributes: [role], fallbackElements: UIElementFallbackCache(initialState: [:])),
            roleFrequencyTable: FrequencyTable<UIElementRole>())
        let beforeLookups = provider.lookups
        prefetched.perform { _ in
            let item = UIElement(element: ax)
            precondition(item.role == .button && item.cache.transactionAttributes == [role])
        }
        precondition(provider.lookups == beforeLookups) // Prefetch hit avoids provider entirely.
        mock.shouldThrow = true
        let retries = transaction(12012)
        retries.perform { _ in
            _ = UIElement(element: ax); _ = UIElement(element: ax)
        }
        precondition(mock.supportReads == 5 && mock.batchReads == 5)
        precondition(fallbackUIElementCache(element: ax, in: retries.cache.fallbackElements) == nil)
    }
    static func checkAXConformance() throws {
        let ax = AXUIElementCreateApplication(12020)
        let other = AXUIElementCreateApplication(12021)
        let mock = AXMockProviderFixture.Mock()
        let provider = AXMockProviderFixture.Provider(ax, mock)
        AXMockProviderStorage.current = provider
        defer { AXMockProviderStorage.current = nil }
        let element: any AXUIElementProtocol = ax
        let pid = try element.pid, actual = try element.actualPID, window = try element.windowID
        precondition(pid == -3 && actual == 42 && window == UInt32.max)
        let actions = try element.actions
        precondition(actions == [.press, .press])
        try element.perform(.press)
        precondition(mock.operationCalls.last == "perform")
        mock.shouldThrow = true
        do { _ = try element.actions; preconditionFailure() }
        catch AXMockProviderFixture.Failure.expected {}
        precondition(ax.isEqual(to: ax) && !ax.isEqual(to: other))
        precondition(!ax.isEqual(to: mock))
        let before = provider.lookups
        precondition(providerAXElementsEqual(ax, ax))
        precondition(!providerAXElementsEqual(ax, other))
        precondition(!providerAXElementsEqual(other, ax))
        precondition(provider.lookups == before + 6)
        final class ReplacingProvider: AXMockProvider {
            var seen: [AXUIElement] = []
            let replacement = AXMockProviderFixture.Mock()
            func lookup(_ element: AXUIElement) -> (any AXUIElementProtocol)? {
                seen.append(element)
                // Equality must retain the original provider for both lookups.
                AXMockProviderStorage.current = nil
                return replacement
            }
        }
        let replacing = ReplacingProvider()
        AXMockProviderStorage.current = replacing
        precondition(providerAXElementsEqual(ax, other))
        precondition(replacing.seen.count == 2)
        precondition(CFEqual(replacing.seen[0], ax) && CFEqual(replacing.seen[1], other))
        AXMockProviderStorage.current = nil
        precondition(providerAXElementsEqual(ax, ax) && !providerAXElementsEqual(ax, other))
    }
    static func main() throws {
        try checkAXConformance()
        checkProviderInitializer()
        checkSubtreeConstruction()
        checkScopedConstruction()
        let outer = transaction(11000), inner = transaction(11001)
        precondition(UIElementTreeTransaction.current == nil && UIElementTreeTransaction.prefetchEnabled)
        let value = outer.perform { element in
            precondition(element is Element && CFEqual(element.axElement, outer.element.axElement))
            precondition(UIElementTreeTransaction.current?.roleFrequencyTable[.group] == 1)
            let active = UIElementTreeTransaction.current!
            storeFallbackUIElementCache(element: element.axElement, supportedAttributes: [],
                attributes: [:], in: active.cache.fallbackElements)
            precondition(fallbackUIElementCache(element: element.axElement, in: outer.cache.fallbackElements) != nil)
            precondition(fallbackUIElementCache(element: element.axElement, in: inner.cache.fallbackElements) == nil)
            UIElementTreeTransaction.$prefetchEnabled.withValue(false) {
                precondition(!UIElementTreeTransaction.prefetchEnabled)
                do {
                    try inner.perform { nested in
                        precondition(CFEqual(UIElementTreeTransaction.current!.element.axElement, nested.axElement))
                        precondition(!UIElementTreeTransaction.prefetchEnabled)
                        throw Failure.expected
                    }
                } catch Failure.expected {} catch { preconditionFailure() }
                precondition(CFEqual(UIElementTreeTransaction.current!.element.axElement, element.axElement))
            }
            precondition(UIElementTreeTransaction.prefetchEnabled)
            return 42
        }
        precondition(value == 42 && UIElementTreeTransaction.current == nil)
        do { try outer.perform { _ in throw Failure.expected } }
        catch Failure.expected {}
        precondition(UIElementTreeTransaction.current == nil)
        print("Complete transaction scope preserves roots, nesting, flags and throwing restoration")
    }
}
