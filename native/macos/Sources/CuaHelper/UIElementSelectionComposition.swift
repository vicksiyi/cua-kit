import ApplicationServices

// Focus candidate helper0x1007666ec and selection capability helper use the
// same ordered attributes filtered against a supplied cached support set.
func uiElementSupportedSelectionAttributes(_ supported: Set<UIElementAttribute>) -> [UIElementAttribute] {
    [UIElementAttribute("AXSelectedRows"), UIElementAttribute("AXSelectedCells"),
     UIElementAttribute("AXSelectedChildren")].filter { supported.contains($0) }
}

extension UIElementProtocol {
    // 0x1007afa64 -> 0x1007afb68: filter the ordered constants constructed at
    // 0x1007afe30 against CACHE support. No fresh support or selected-value read.
    var supportedSelectionAttributes: [UIElementAttribute] {
        uiElementSupportedSelectionAttributes(cache.supportedAttributes)
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
        let root: any UIElementProtocol = self
        return uiElementClickingMayCauseSelection(root, parent: { element in
            element.parentValue(transaction: transaction,
                read: { environment.read(element.axElement, UIElementAttribute(kAXParentAttribute)) },
                reportError: reportError)
        }, role: { $0.role }, isSelectable: { $0.isSelectable(in: environment) },
            hasSupportedSelectionAttributes: { !$0.supportedSelectionAttributes.isEmpty })
    }
}
