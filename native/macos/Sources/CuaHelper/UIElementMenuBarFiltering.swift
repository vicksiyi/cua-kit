import Foundation

// Source0x10076825c skips index0 before reading title; "Debug" matching is
// case sensitive. Visit immediately after each retained title read so capture
// remains interleaved with filtering, as in the original provider loop.
func forEachImmediateMenuBarItem<Element>(_ items: [Element], title: (Element) -> String?,
    visit: (Element) -> Void) {
    for (index, item) in items.enumerated() {
        guard index != 0 else { continue }
        if let value = title(item), value.contains("Debug") { continue }
        visit(item)
    }
}

func immediateMenuBarItems<Element>(_ items: [Element], title: (Element) -> String?) -> [Element] {
    var result: [Element] = []
    forEachImmediateMenuBarItem(items, title: title, visit: { result.append($0) })
    return result
}
