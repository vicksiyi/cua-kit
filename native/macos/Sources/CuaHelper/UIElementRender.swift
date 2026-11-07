import Foundation

// Native reference type at 0x10063e644/0x10063e6e8. Element IDs are assigned
// separately from stable accessibility identity; rendering does not allocate IDs.
final class UIElementRender<Identity: Hashable> {
    let id: Identity
    var elementID: Int?
    let text: String
    let detailText: String?
    let sourcePath: IndexPath?
    var children: [UIElementRender<Identity>]

    init(id: Identity, elementID: Int?, text: String, detailText: String?,
         sourcePath: IndexPath?, children: [UIElementRender<Identity>]) {
        self.id = id
        self.elementID = elementID
        self.text = text
        self.detailText = detailText
        self.sourcePath = sourcePath
        self.children = children
    }

    // 0x10063e7e4: preserve child reference and insertion order.
    func append(child: UIElementRender<Identity>) { children.append(child) }
}

extension UIElementTree.Item {
    // The callback at 0x10064e220, invoked by compactTreeMap through 0x10064e458.
    // This is only the node projection: tree assembly/empty-parent semantics
    // belong to compactTreeMap and are intentionally not inferred here.
    func renderNode<Context: AccessibilityRenderingContext>(
        sourcePath: IndexPath,
        context: inout Context,
        render: (Element, inout Context) throws -> String
    ) rethrows -> UIElementRender<Element.ID>? where Element.Role == Context.Role {
        let text = try render(element, &context)
        guard !text.isEmpty else { return nil }
        return UIElementRender(id: element.id, elementID: nil, text: text,
                               detailText: availableSubsetDescription,
                               sourcePath: sourcePath, children: [])
    }
}
