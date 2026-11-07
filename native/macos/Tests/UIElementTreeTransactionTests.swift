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
        let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [], attributes: [:], transactionAttributes: nil))
        let attribute = UIElementAttribute("AXValue")
        try item.setValue("provider write", forAttribute: attribute)
        precondition(mock.writtenValue as? String == "provider write")
        precondition(mock.requested == [attribute] && mock.operationCalls.last == "write")
        precondition(item.cache.attributes.isEmpty)
        mock.shouldThrow = true
        do { try item.setValue("failed write", forAttribute: attribute); preconditionFailure() }
        catch AXMockProviderFixture.Failure.expected {}
        do { _ = try element.actions; preconditionFailure() }
        catch AXMockProviderFixture.Failure.expected {}
        precondition(ax.isEqual(to: ax) && !ax.isEqual(to: other))
        precondition(!ax.isEqual(to: mock))
        let first = Element(element: ax)
        let differentCache = Element(element: ax, cache: UIElementCache(supportedAttributes: [attribute], attributes: [:], transactionAttributes: [attribute]))
        precondition(first.id === ax && first == differentCache)
        let hashLookups = provider.lookups
        var expectedHash = Hasher(), observedHash = expectedHash
        expectedHash.combine(CFHash(ax))
        first.hash(into: &observedHash)
        precondition(expectedHash.finalize() == observedHash.finalize())
        precondition(provider.lookups == hashLookups)
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
        precondition(Element(element: ax) == Element(element: other))
        precondition(replacing.seen.count == 2)
        precondition(CFEqual(replacing.seen[0], ax) && CFEqual(replacing.seen[1], other))
        AXMockProviderStorage.current = nil
        precondition(providerAXElementsEqual(ax, ax) && !providerAXElementsEqual(ax, other))
    }
    static func checkProviderParent() throws {
        let ax = AXUIElementCreateApplication(12101), parent = AXUIElementCreateApplication(12102)
        let key = UIElementAttribute("AXParent"), title = UIElementAttribute("AXTitle")
        let mock = AXMockProviderFixture.Mock()
        let provider = AXMockProviderFixture.Provider(ax, mock)
        AXMockProviderStorage.current = provider
        defer { AXMockProviderStorage.current = nil }
        func partial(_ value: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: value), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        let owner = UIElementTreeTransaction(element: Element(element: ax),
            cache: UIElementTransactionCache(attributeTable: [parent: [title: partial("cached parent" as NSString)]],
                requestedAttributes: [title], fallbackElements: UIElementFallbackCache(initialState: [:])),
            roleFrequencyTable: FrequencyTable<UIElementRole>())
        let cached = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [key],
            attributes: [key: partial(parent)], transactionAttributes: nil))
        let uncached = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [key],
            attributes: [:], transactionAttributes: nil))
        owner.perform { _ in
            let value = cached.parentValue(reportError: { _ in preconditionFailure() })!
            precondition(CFEqual(value.axElement, parent) && value.cachedStringValue(for: title) == "cached parent")
            precondition(provider.lookups == 0)
            mock.output = (.success, partial(parent))
            let fetched = uncached.parentValue(reportError: { _ in preconditionFailure() })!
            precondition(fetched.cachedStringValue(for: title) == "cached parent" && provider.lookups == 1)
            mock.output = (.failure, partial(parent))
            var errors = 0
            precondition(uncached.parentValue(reportError: { _ in errors += 1 }) == nil && errors == 1)
        }
        mock.output = (.success, nil)
        precondition(uncached.parentValue(reportError: { _ in preconditionFailure() }) == nil)
        let ordinary = try decodeAXUIElement("not an element" as NSString, throwingOnFailure: false)
        precondition(ordinary == nil)
    }
    static func checkProviderCollections() throws {
        let ax = AXUIElementCreateApplication(12201), child = AXUIElementCreateApplication(12202)
        let children = UIElementAttribute("AXChildren"), visible = UIElementAttribute("AXVisibleRows")
        let mock = AXMockProviderFixture.Mock()
        let provider = AXMockProviderFixture.Provider(ax, mock)
        AXMockProviderStorage.current = provider
        defer { AXMockProviderStorage.current = nil }
        func partial(_ value: AnyObject, count: Int? = nil) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: value),
                arraySubsetDescriptor: count.map { AXArraySubsetDescriptor(count: $0, availableRanges: nil) },
                textTruncationDescriptor: nil)
        }
        let owner = UIElementTreeTransaction(element: Element(element: ax),
            cache: UIElementTransactionCache(attributeTable: [child: [:]], requestedAttributes: [],
                fallbackElements: UIElementFallbackCache(initialState: [:])), roleFrequencyTable: FrequencyTable())
        let raw = partial([child, "skip me" as NSString, child] as NSArray)
        let cached = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [children], attributes: [children: raw], transactionAttributes: nil))
        let uncached = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [children], attributes: [:], transactionAttributes: nil))
        owner.perform { _ in
            let result = cached.childrenValue(reportError: { _ in preconditionFailure() })
            precondition(result.count == 2 && result.allSatisfy { CFEqual($0.axElement, child) })
            precondition(provider.lookups == 0)
            let titleTargets = UIElementAttribute("AXServesAsTitleForUIElements")
            let label = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [titleTargets], attributes: [titleTargets: raw], transactionAttributes: nil))
            let identities = label.titleTargetIdentities(reportError: { _ in preconditionFailure() })
            precondition(identities.count == 2 && identities.allSatisfy { CFEqual($0, child) })
            precondition(provider.lookups == 0)
            mock.output = (.success, raw)
            precondition(uncached.childrenValue(reportError: { _ in preconditionFailure() }).count == 2)
            precondition(provider.lookups == 1)
            mock.output = (.failure, raw)
            var errors = 0
            precondition(uncached.childrenValue(reportError: { _ in errors += 1 }).isEmpty && errors == 1)
        }
        mock.support = [visible, children]
        let selectedEmpty = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [visible, children],
            attributes: [visible: partial([] as NSArray, count: 2), children: raw], transactionAttributes: nil))
        let before = provider.lookups
        let count = try selectedEmpty.count(for: visible)
        precondition(count == 2 && provider.lookups == before)
        precondition(selectedEmpty.childrenPreferringVisible(reportError: { _ in preconditionFailure() }).isEmpty)
        precondition(provider.lookups == before + 1) // Fresh support only, no fallback to AXChildren.
    }
    static func checkProviderScrollBar() throws {
        let ax = AXUIElementCreateApplication(12301), bar = AXUIElementCreateApplication(12302)
        let increment = AXUIElementCreateApplication(12303), decrement = AXUIElementCreateApplication(12304)
        let role = UIElementAttribute("AXRole"), subrole = UIElementAttribute("AXSubrole")
        let children = UIElementAttribute("AXChildren")
        let vertical = UIElementAttribute("AXVerticalScrollBar"), horizontal = UIElementAttribute("AXHorizontalScrollBar")
        func partial(_ value: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: value), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        let mock = AXMockProviderFixture.Mock(), provider = AXMockProviderFixture.Provider(ax, AXMockProviderFixture.Mock())
        AXMockProviderStorage.current = provider
        defer { AXMockProviderStorage.current = nil }
        let owner = UIElementTreeTransaction(element: Element(element: ax),
            cache: UIElementTransactionCache(attributeTable: [
                bar: [role: partial("AXGroup" as NSString), children: partial([increment, decrement] as NSArray)],
                increment: [role: partial("AXButton" as NSString), subrole: partial("AXIncrementPage" as NSString)],
                decrement: [role: partial("AXButton" as NSString), subrole: partial("AXDecrementPage" as NSString)]
            ], requestedAttributes: [role, subrole, children], fallbackElements: UIElementFallbackCache(initialState: [:])),
            roleFrequencyTable: FrequencyTable())
        let item = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [vertical, horizontal],
            attributes: [vertical: partial(bar), horizontal: partial(bar)], transactionAttributes: nil))
        try owner.perform { _ in
            for direction in [UIElementScrollDirection.up, .down, .left, .right] {
                var calls = 0
                let result = try item.scrollUsingScrollBar(direction: direction, perform: { button, action in
                    calls += 1
                    let expected = direction == .up || direction == .left ? decrement : increment
                    precondition(CFEqual(button.axElement, expected) && action == .press)
                }, reportError: { _ in preconditionFailure() })
                precondition(result && calls == 1)
            }
            do {
                _ = try item.scrollUsingScrollBar(direction: .down, perform: { _, _ in throw Failure.expected },
                    reportError: { _ in preconditionFailure() })
                preconditionFailure()
            } catch Failure.expected {}
            precondition(provider.lookups == 0)
        }
        AXMockProviderStorage.current = AXMockProviderFixture.Provider(bar, mock)
        let cold = ScrollBarUIElement(element: bar)
        precondition(CFEqual(cold.axElement, bar) && mock.supportReads == 1)
    }
    static func checkProviderGeometry() throws {
        let ax = AXUIElementCreateApplication(12401), parent = AXUIElementCreateApplication(12402)
        let mock = AXMockProviderFixture.Mock(), provider = AXMockProviderFixture.Provider(ax, AXMockProviderFixture.Mock())
        AXMockProviderStorage.current = provider
        defer { AXMockProviderStorage.current = nil }
        func partial(_ value: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: value), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        var point = CGPoint(x: 7, y: 11), size = CGSize(width: 21, height: 31)
        var rect = CGRect(x: 99, y: 101, width: 14, height: 17)
        let position = partial(AXValueCreate(.cgPoint, &point)!), dimensions = partial(AXValueCreate(.cgSize, &size)!)
        let direct = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [.frame],
            attributes: [.frame: partial(AXValueCreate(.cgRect, &rect)!)], transactionAttributes: nil))
        precondition(direct.frameValue(reportError: { _ in preconditionFailure() }) == rect && provider.lookups == 0)
        let fallback = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [.frame, .position, .size],
            attributes: [.position: position, .size: dimensions], transactionAttributes: nil))
        provider.mock.output = (.failure, nil)
        var errors = 0
        precondition(fallback.frameValue(reportError: { _ in errors += 1 }) == CGRect(origin: point, size: size))
        precondition(errors == 1 && provider.lookups == 1 && provider.mock.requested == [.frame])
        let role = UIElementAttribute("AXRole"), parentKey = UIElementAttribute("AXParent")
        let owner = UIElementTreeTransaction(element: Element(element: ax),
            cache: UIElementTransactionCache(attributeTable: [parent: [role: partial("AXWebArea" as NSString)]],
                requestedAttributes: [role, parentKey], fallbackElements: UIElementFallbackCache(initialState: [:])),
            roleFrequencyTable: FrequencyTable())
        let child = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [role, parentKey],
            attributes: [role: partial("AXButton" as NSString), parentKey: partial(parent)], transactionAttributes: nil))
        owner.perform { _ in
            precondition(child.isInsideWebView(reportError: { _ in preconditionFailure() }))
            precondition(provider.lookups == 1)
        }
        AXMockProviderStorage.current = AXMockProviderFixture.Provider(parent, mock)
        let notWeb = UIElement(axElement: parent, cache: UIElementCache(supportedAttributes: [role],
            attributes: [role: partial("AXButton" as NSString)], transactionAttributes: nil))
        precondition(!notWeb.isInsideWebView(reportError: { _ in preconditionFailure() }))
        mock.bundleIdentifier = "com.openai.atlas.test"
        precondition(notWeb.isInsideWebView(reportError: { _ in preconditionFailure() }))
        mock.bundleIdentifier = "org.example.com.openai.atlas"
        precondition(!notWeb.isInsideWebView(reportError: { _ in preconditionFailure() }))
    }
    static func checkProviderCapabilities() {
        let ax = AXUIElementCreateApplication(12601)
        let mock = AXMockProviderFixture.Mock(), provider = AXMockProviderFixture.Provider(ax, AXMockProviderFixture.Mock())
        AXMockProviderStorage.current = provider
        defer { AXMockProviderStorage.current = nil }
        let role = UIElementAttribute("AXRole"), focused = UIElementAttribute("AXFocused")
        let selected = UIElementAttribute("AXSelected"), traits = UIElementAttribute("AXTraits")
        let value = UIElementAttribute("AXValue"), disclosing = UIElementAttribute("AXDisclosing")
        func partial(_ object: AnyObject) -> AXPartialValue {
            AXPartialValue(value: AXEncodedValue(value: object), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        }
        func item(_ roleName: String, _ extra: [UIElementAttribute: AXPartialValue] = [:]) -> UIElement {
            var data = extra; data[role] = partial(roleName as NSString)
            return UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [role, focused, selected, traits, value, disclosing], attributes: data, transactionAttributes: nil))
        }
        provider.mock.settableResult = true
        let button = item("AXButton")
        precondition(button.isFocusable && button.isSelectable && button.isValueSettable && button.isDisclosable)
        let before = provider.lookups
        precondition(!item("AXMenuItem").isSelectable && !item("AXMenuBarItem").isSelectable)
        precondition(provider.lookups == before)
        provider.mock.shouldThrow = true
        precondition(item("AXTextField").isFocusable) // Missing enabled defaults true on writability error.
        precondition(!button.isFocusable && !button.isValueSettable && !button.isDisclosable)
        provider.mock.output = (.success, partial(NSNumber(value: UInt64(8))))
        precondition(button.isSelected(reportError: { _ in preconditionFailure() }))
        let beforeSelected = provider.lookups
        precondition(!item("AXButton", [selected: partial("bad value" as NSString)]).isSelected(reportError: { _ in preconditionFailure() }))
        precondition(provider.lookups == beforeSelected)
        AXMockProviderStorage.current = AXMockProviderFixture.Provider(ax, mock)
        let absent = UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [role], attributes: [role: partial("AXButton" as NSString)], transactionAttributes: nil))
        precondition(!absent.isFocusable && !absent.isValueSettable && !absent.isDisclosable)
        precondition(mock.operationCalls.isEmpty)
    }
    static func checkCachedTypedValues() throws {
        let ax = AXUIElementCreateApplication(12701)
        let provider = AXMockProviderFixture.Provider(ax, AXMockProviderFixture.Mock())
        AXMockProviderStorage.current = provider
        defer { AXMockProviderStorage.current = nil }
        let value = UIElementAttribute("AXValue"), urlKey = UIElementAttribute("AXURL")
        func item(_ key: UIElementAttribute, _ object: AnyObject?) -> UIElement {
            let partial = object.map { AXPartialValue(value: AXEncodedValue(value: $0), arraySubsetDescriptor: nil, textTruncationDescriptor: nil) }
            return UIElement(axElement: ax, cache: UIElementCache(supportedAttributes: [key],
                attributes: partial.map { [key: $0] } ?? [:], transactionAttributes: nil))
        }
        precondition(item(value, NSNumber(value: true)).boolValue == true)
        precondition(item(value, NSNumber(value: false)).boolValue == false)
        precondition(item(value, "false" as NSString).boolValue == nil)
        precondition(item(value, nil).boolValue == nil)
        let url = URL(string: "https://example.com/path?q=1")!
        precondition(item(urlKey, url as NSURL).url == url)
        precondition(item(urlKey, url.absoluteString as NSString).url == nil)
        precondition(item(urlKey, nil).url == nil && provider.lookups == 0)
        do {
            _ = try decodeAXURL("https://example.com" as NSString, throwingOnFailure: true)
            preconditionFailure()
        } catch UIElementError.failedToUnwrapAttributeValue(let type) { precondition(type == URL.self) }
        let invalid = try decodeAXURL(ax, throwingOnFailure: false)
        precondition(invalid == nil)
    }
    static func main() throws {
        try checkCachedTypedValues()
        checkProviderCapabilities()
        try checkProviderGeometry()
        try checkProviderScrollBar()
        try checkProviderCollections()
        try checkProviderParent()
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
