import CoreGraphics
import CoreFoundation

// Adapter to this project's observation transport, not a replacement AX walk.
// Resolve every exported ID through the revision's source-path table, including
// focus-only IDs; omitted rendering ancestors must not shift source lookup.
func selectionObservedNodes(_ revision: UIElementTreeRevision<TransformedUIElement>,
    frame: (TransformedUIElement) -> CGRect?,
    selectedRange: (TransformedUIElement) -> CFRange? = { _ in nil }
) throws -> [Node] {
    var result: [Node] = []
    var seen: Set<Int> = []
    func visit(_ rendered: [UIElementRender<TransformedUIElement.ID>], parent: Int?) throws {
        for render in rendered {
            guard let id = render.elementID, let item = revision.item(for: id) else {
                throw fail("STALE_OBSERVATION", "Rendered element has no revision source binding.")
            }
            if seen.insert(id).inserted {
                let element = item.element
                let secure = element.subrole == "AXSecureTextField"
                var data: [String: Any] = ["id": id, "role": element.role.rawValue,
                    "name": element.title ?? element.description ?? ""]
                if let parent { data["parentId"] = parent }
                if let rect = frame(element) { data["frame"] = rectData(rect) }
                if !secure, let value = element.value { data["value"] = value }
                var properties: [String: Any] = ["secure": secure,
                    "actions": element.actionDescriptions.map { $0.action.name }.joined(separator: ","),
                    "AXEnabled": element.isEnabled, "AXFocused": element.isFocused,
                    "AXSelected": element.isSelected]
                if let range = selectedRange(element) {
                    properties["selectionStart"] = range.location
                    properties["selectionLength"] = range.length
                }
                data["properties"] = properties
                result.append(Node(element: element.axElement, data: data))
            }
            try visit(render.children, parent: id)
        }
    }
    try visit(revision.renderTree.roots, parent: nil)
    if let focus = revision.focusRenderTree { try visit(focus.roots, parent: nil) }
    return result
}
