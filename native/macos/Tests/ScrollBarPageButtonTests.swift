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
        print("native page-button discovery preserves role, subrole, first match and cached identity")
    }
}
