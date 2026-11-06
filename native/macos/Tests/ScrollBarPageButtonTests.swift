import ApplicationServices
import Foundation

@main
struct ScrollBarPageButtonTests {
    static func element(_ role: AnyObject?, _ subrole: AnyObject?, id: Int32) -> UIElement {
        var attributes: [UIElementAttribute: AXPartialValue] = [:]
        for (key, value) in [("AXRole", role), ("AXSubrole", subrole)] {
            if let value {
                attributes[UIElementAttribute(key)] = AXPartialValue(
                    value: AXEncodedValue(value: value), arraySubsetDescriptor: nil,
                    textTruncationDescriptor: nil)
            }
        }
        return UIElement(axElement: AXUIElementCreateApplication(id),
            cache: UIElementCache(supportedAttributes: [], attributes: attributes,
                                  transactionAttributes: []))
    }

    static func main() throws {
        for selection: ScrollBarPageButton in [.increment, .decrement] {
            let expected = selection.subrole as NSString
            let first = element("AXButton" as NSString, expected, id: 424242)
            let second = element("AXButton" as NSString, expected, id: 424243)
            let invalid = [
                element(nil, expected, id: 1),
                element(NSNumber(value: 1), expected, id: 2),
                element("AXGroup" as NSString, expected, id: 3),
                element("AXButton" as NSString, nil, id: 4),
                element("AXButton" as NSString, NSNumber(value: 1), id: 5),
                element("AXButton" as NSString, "AXIncrementArrow" as NSString, id: 6),
                element("AXButton" as NSString, selection.subrole.lowercased() as NSString, id: 7),
            ]
            precondition(selection.find(in: []) == nil)
            precondition(selection.find(in: invalid) == nil)
            let found = selection.find(in: invalid + [first, second])!
            precondition(found.axElement === first.axElement)
            precondition(found.cache.attributes.count == first.cache.attributes.count)
            precondition(found.cache.transactionAttributes == [])
            var pressed = false
            let handled = try uiElementScrollUsingScrollBar(
                direction: selection == .increment ? .down : .up,
                verticalScrollBar: { invalid + [first, second] },
                horizontalScrollBar: { fatalError("wrong axis") },
                decrementPageButton: { ScrollBarPageButton.decrement.find(in: $0) },
                incrementPageButton: { ScrollBarPageButton.increment.find(in: $0) },
                perform: { button, action in
                    precondition(button.axElement === first.axElement && action == .press)
                    pressed = true
                })
            precondition(handled && pressed)
        }
        let valid = element("AXButton" as NSString, "AXIncrementPage" as NSString, id: 424244)
        var initialized: [AXUIElement] = []
        let array: NSArray = ["wrong", valid.axElement, NSNumber(value: 12), valid.axElement, NSArray()]
        let decoded = decodeCFUIElementArray(array) { ax in
            initialized.append(ax)
            return UIElement(axElement: ax, cache: valid.cache)
        }!
        precondition(decoded.count == 2 && initialized.count == 2)
        precondition(initialized.allSatisfy { $0 === valid.axElement })
        precondition(ScrollBarPageButton.increment.find(in: decoded)!.axElement === valid.axElement)
        let boxed: NSArray = [valid as AnyObject]
        let preserved = decodeCFUIElementArray(boxed) { _ in fatalError("boxed element must not reinitialize") }!
        precondition(preserved.count == 1 && preserved[0].axElement === valid.axElement)
        initialized.removeAll()
        precondition(decodeCFUIElementArray(NSArray()) { _ in fatalError("empty") }!.isEmpty)
        for invalid: AnyObject in ["wrong" as NSString, valid.axElement, NSNumber(value: 12)] {
            precondition(decodeCFUIElementArray(invalid) { _ in fatalError("not array") } == nil)
        }
        // Exercise actual system constructor/cache lookup, not a fixture initializer.
        // Invalid PID references make a lost prefetch fail the selection assertion.
        let requested: Set<UIElementAttribute> = [UIElementAttribute("AXRole"), UIElementAttribute("AXSubrole")]
        let emptyChild = AXUIElementCreateApplication(424245)
        let fallback = UIElementFallbackCache(initialState: [:])
        storeFallbackUIElementCache(element: emptyChild, supportedAttributes: requested,
            attributes: valid.cache.attributes, in: fallback)
        let transaction = UIElementTransactionCache(
            attributeTable: [valid.axElement: valid.cache.attributes, emptyChild: [:]],
            requestedAttributes: requested, fallbackElements: fallback)
        let systemDecoded = decodeSystemCFUIElementArray(
            [emptyChild, valid.axElement, valid.axElement] as NSArray, transaction: transaction)!
        precondition(systemDecoded.count == 3)
        precondition(systemDecoded[0].cache.attributes.isEmpty) // empty prefetch wins over fallback
        precondition(systemDecoded.allSatisfy { $0.cache.transactionAttributes == requested })
        let systemSelected = ScrollBarPageButton.increment.find(in: systemDecoded)!
        precondition(systemSelected.axElement === valid.axElement)
        let originalSubrole = valid.cache.attributes[UIElementAttribute("AXSubrole")]!.value.value
        precondition(systemSelected.cache.attributes[UIElementAttribute("AXSubrole")]!.value.value === originalSubrole)
        precondition(fallbackUIElementCache(element: valid.axElement, in: fallback) == nil)
        let childrenKey = UIElementAttribute("AXChildren")
        let childrenRaw = AXPartialValue(value: AXEncodedValue(value: [valid.axElement] as NSArray),
            arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        enum DecodeFailure: Error { case fixture }
        for cached in [false, true] {
            for cacheFails in [false, true] {
                for status: AXError in [.success, .noValue, .attributeUnsupported, .cannotComplete] {
                    var trace: [String] = []
                    let parent = UIElement(axElement: emptyChild, cache: UIElementCache(
                        supportedAttributes: [childrenKey],
                        attributes: cached ? [childrenKey: childrenRaw] : [:], transactionAttributes: nil))
                    let result = parent.elementCollectionValue(for: childrenKey, read: {
                        trace.append("read"); return (status, childrenRaw)
                    }, decode: { partial, strict in
                        precondition(partial.value.value === childrenRaw.value.value)
                        trace.append(strict ? "strict" : "cached")
                        if !strict && cacheFails { throw DecodeFailure.fixture }
                        return [] // empty array is a successful cached decode
                    }, reportError: { _ in trace.append("error") })
                    precondition(result.isEmpty)
                    if cached && !cacheFails { precondition(trace == ["cached"]) }
                    else {
                        let prefix = cached ? ["cached"] : []
                        precondition(trace == prefix + ["read", status == .cannotComplete ? "error" : "strict"])
                    }
                }
            }
        }
        let unsupportedParent = UIElement(axElement: emptyChild, cache: UIElementCache(
            supportedAttributes: [], attributes: [:], transactionAttributes: [childrenKey]))
        let absent = unsupportedParent.elementCollectionValue(for: childrenKey,
            read: { fatalError("known unsupported must not read") },
            decode: { _, _ in fatalError("no value") }, reportError: { _ in fatalError("not an error") })
        precondition(absent.isEmpty)
        var reports = 0
        let strictFailure = valid.elementCollectionValue(for: childrenKey,
            read: { (.success, childrenRaw) },
            decode: { _, strict in precondition(strict); throw DecodeFailure.fixture },
            reportError: { error in precondition(error is DecodeFailure); reports += 1 })
        precondition(strictFailure.isEmpty && reports == 1)
        for strict in [false, true] {
            for raw: AnyObject in ["bad" as NSString, valid.axElement, NSNumber(value: 7)] {
                do {
                    let result = try decodeUIElementArray(raw, throwingOnFailure: strict) { _ in fatalError("not an array") }
                    precondition(!strict && result == nil)
                } catch UIElementError.failedToUnwrapAttributeValue(let target) {
                    precondition(strict && target == [UIElement].self)
                }
            }
            let filtered = try decodeUIElementArray(["bad", 3, NSArray()] as NSArray,
                throwingOnFailure: strict) { _ in fatalError("no AX members") }
            precondition(filtered != nil && filtered!.isEmpty)
            var axError = AXError.cannotComplete
            let errorValue = AXValueCreate(.axError, &axError)!
            do {
                let result = try decodeUIElementArray(errorValue, throwingOnFailure: strict) { _ in fatalError() }
                precondition(!strict && result == nil)
            } catch UIElementError.axError(let error) {
                precondition(strict && error == .cannotComplete)
            }
        }
        var readCount = 0
        var errors: [Error] = []
        let actualChildren = valid.systemElementCollectionValue(for: childrenKey, transaction: transaction,
            read: { readCount += 1; return (.success, childrenRaw) }, reportError: { errors.append($0) })
        precondition(readCount == 1 && errors.isEmpty && actualChildren.count == 1)
        precondition(ScrollBarPageButton.increment.find(in: actualChildren)!.axElement === valid.axElement)
        let wrongPartial = AXPartialValue(value: AXEncodedValue(value: "wrong" as NSString),
            arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        let failedChildren = valid.systemElementCollectionValue(for: childrenKey, transaction: transaction,
            read: { readCount += 1; return (.success, wrongPartial) }, reportError: { errors.append($0) })
        precondition(readCount == 2 && errors.count == 1 && failedChildren.isEmpty)
        precondition(ScrollBarUIElement.role == UIElementRole("AXScrollBar"))
        let barAX = AXUIElementCreateApplication(424246)
        let barTransaction = UIElementTransactionCache(
            attributeTable: [barAX: [childrenKey: childrenRaw], valid.axElement: valid.cache.attributes],
            requestedAttributes: requested.union([childrenKey]),
            fallbackElements: UIElementFallbackCache(initialState: [:]))
        let bar = ScrollBarUIElement(systemElement: barAX, transaction: barTransaction)
        precondition(bar.axElement === barAX)
        precondition(bar.cache.attributes[childrenKey]!.value.value === childrenRaw.value.value)
        let page = bar.pageButton(.increment, transaction: barTransaction,
            readChildren: { fatalError("prefetched children must not refetch") },
            reportError: { _ in fatalError("prefetched children are valid") })!
        precondition(page.axElement === valid.axElement)
        precondition(bar.pageButton(.decrement, transaction: barTransaction,
            readChildren: { fatalError("prefetched children must not refetch") },
            reportError: { _ in fatalError() }) == nil)
        let decodedBar = try decodeAXScrollBar(barAX, throwingOnFailure: true, transaction: barTransaction)!
        precondition(decodedBar.axElement === barAX)
        precondition(decodedBar.cache.attributes[childrenKey]!.value.value === childrenRaw.value.value)
        // The original unwrappedElement helper has no role check, even when the
        // concrete type has static role metadata. Preserve that distinction.
        let buttonAsBar = try decodeAXScrollBar(valid.axElement, throwingOnFailure: true, transaction: barTransaction)!
        precondition(buttonAsBar.axElement === valid.axElement)
        let sameAX: AXUIElement? = try unwrapAXElement(valid.axElement, throwingOnFailure: true) { _ in
            fatalError("direct cast must skip initializer")
        }
        precondition(sameAX === valid.axElement)
        for strict in [false, true] {
            do {
                let result: ScrollBarUIElement? = try unwrapAXElement("bad" as NSString, throwingOnFailure: strict) { _ in fatalError() }
                precondition(!strict && result == nil)
            } catch UIElementError.failedToUnwrapAttributeValue(let target) {
                precondition(strict && target == AXUIElement.self)
            }
            do {
                let result = try decodeAXScrollBar(NSArray(), throwingOnFailure: strict, transaction: barTransaction)
                precondition(!strict && result == nil)
            } catch UIElementError.unexpectedAttributeValueType(let expected, let actual) {
                precondition(strict && expected == [Any].self && actual == ScrollBarUIElement.self)
            }
        }
        for direction: UIElementScrollDirection in [.up, .down, .left, .right] {
            let axis = (direction == .up || direction == .down) ? "AXVerticalScrollBar" : "AXHorizontalScrollBar"
            let pageName = (direction == .up || direction == .left) ? "AXDecrementPage" : "AXIncrementPage"
            let target = element("AXButton" as NSString, pageName as NSString, id: 424247)
            let parent = UIElement(axElement: emptyChild, cache: UIElementCache(
                supportedAttributes: [], attributes: [:], transactionAttributes: []))
            let chainTransaction = UIElementTransactionCache(
                attributeTable: [barAX: [:], target.axElement: target.cache.attributes],
                requestedAttributes: requested, fallbackElements: UIElementFallbackCache(initialState: [:]))
            var reads: [String] = []
            var presses = 0
            let handled = try parent.scrollUsingSystemScrollBar(direction: direction,
                transaction: chainTransaction, read: { ax, key in
                    let name = key.name as String
                    reads.append(name)
                    let raw: AnyObject
                    if ax === parent.axElement {
                        precondition(name == axis); raw = barAX
                    } else {
                        precondition(ax === barAX && name == "AXChildren"); raw = [target.axElement] as NSArray
                    }
                    return (.success, AXPartialValue(value: AXEncodedValue(value: raw),
                        arraySubsetDescriptor: nil, textTruncationDescriptor: nil))
                }, perform: { child, action in
                    precondition(child.axElement === target.axElement && action == .press); presses += 1
                }, reportError: { _ in fatalError("unexpected chain failure") })
            precondition(handled && presses == 1 && reads == [axis, "AXChildren"])
        }
        for status: AXError in [.success, .cannotComplete, .noValue] {
            var failures = 0
            let handled = try valid.scrollUsingSystemScrollBar(direction: .up, transaction: barTransaction,
                read: { _, _ in (status, status == .noValue ? nil : wrongPartial) },
                perform: { _, _ in fatalError("failed bar lookup must not perform") },
                reportError: { _ in failures += 1 })
            precondition(!handled && failures == (status == .noValue ? 0 : 1))
        }
        print("native page-button discovery preserves role, subrole, first match and cached identity")
    }
}
