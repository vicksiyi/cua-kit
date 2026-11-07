import Foundation
import ApplicationServices
import os

@main struct Test {
    enum Failure: Error { case expected }
    struct Element: UIElementProtocol {
        let axElement: AXUIElement
        let cache = UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil)
        init(element: AXUIElement) { axElement = element }
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
    static func main() throws {
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
