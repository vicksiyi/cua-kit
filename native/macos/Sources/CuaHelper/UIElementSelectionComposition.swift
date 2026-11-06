import ApplicationServices

extension UIElement {
    // 0x1007afa64 -> 0x1007afb68: filter the ordered constants constructed at
    // 0x1007afe30 against CACHE support. No fresh support or selected-value read.
    var supportedSelectionAttributes: [UIElementAttribute] {
        [UIElementAttribute("AXSelectedRows"), UIElementAttribute("AXSelectedCells"),
         UIElementAttribute("AXSelectedChildren")].filter { cache.supportedAttributes.contains($0) }
    }

    func isSelectable(in environment: UIElementActionEnvironment) -> Bool {
        uiElementIsSelectable(role: role) {
            uiElementIsAttributeSupportedAndSettable(UIElementAttribute(kAXSelectedAttribute),
                readCache: { cache }, freshSupportedAttributes: { environment.supported(axElement) },
                isAttributeSettable: { try environment.settable(axElement, $0) })
        }
    }

    // Explicit transaction/environment composition; this is not a substitute
    // for the complete original TaskLocal provider or the click state machine.
    func clickingMayCauseSelection(
        transaction: UIElementTransactionCache?,
        environment: UIElementActionEnvironment,
        reportError: @escaping (Error) -> Void
    ) -> Bool {
        uiElementClickingMayCauseSelection(self, parent: { element in
            element.parentValue(transaction: transaction,
                read: { environment.read(element.axElement, UIElementAttribute(kAXParentAttribute)) },
                reportError: reportError)
        }, role: { $0.role }, isSelectable: { $0.isSelectable(in: environment) },
            hasSupportedSelectionAttributes: { !$0.supportedSelectionAttributes.isEmpty })
    }
}
