import Foundation

extension UIElementAttribute {
    // Original initializer 0x10079c8e0..<0x10079c91c.
    static let chromeNodeID = UIElementAttribute("ChromeAXNodeId")
}

// Context window probe 0x100758cb4..<0x100758e90. Only the first immediate
// AX child is examined. No recursive search and no role/name heuristics.
// The caller supplies the original partial-array read/decode boundary.
func uiElementWindowHasChromeNode<Element>(
    readChildren: (_ index: Int, _ maxValues: Int, _ countIfKnown: Int?) throws -> [Element]?,
    supportedAttributes: (Element) -> [UIElementAttribute]
) -> Bool {
    guard let children = try? readChildren(0, 1, nil), let first = children.first else { return false }
    return supportedAttributes(first).contains(.chromeNodeID)
}
