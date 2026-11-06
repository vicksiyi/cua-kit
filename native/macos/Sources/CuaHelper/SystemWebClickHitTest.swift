import ApplicationServices

extension UIElement {
    func systemWebClickHitsTarget(
        app: UIElement, transaction: UIElementTransactionCache?, reportError: @escaping (Error) -> Void
    ) async -> Bool {
        await uiElementWebClickHitsTarget(target: self,
            clickablePoint: { try await systemClickablePoint(transaction: transaction, reportError: reportError) },
            hitTest: { try systemAXElementAtPoint($0, in: app.axElement, transaction: transaction) },
            parent: { element in
                element.parentValue(transaction: transaction,
                    read: { readSystemAXAttributeValue(element.axElement, UIElementAttribute(kAXParentAttribute)) },
                    reportError: reportError)
            }, equal: { $0.representsSameSystemElement(as: $1) })
    }
}
