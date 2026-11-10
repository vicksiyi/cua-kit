import ApplicationServices

extension UIElementProtocol {
    func clickablePoint(
        scrollToVisible: Bool,
        transaction: UIElementTransactionCache?,
        environment: UIElementActionEnvironment,
        preferredPoint: () -> CGPoint?,
        scrollFrameToVisible: (CGRect) async throws -> Bool,
        reportError: (Error) -> Void
    ) async throws -> (point: CGPoint?, didScroll: Bool) {
        try await uiElementClickablePoint(scrollToVisible: scrollToVisible,
            preferredPoint: preferredPoint,
            frameBeforeScroll: { frameValue(readAttribute: { environment.read(axElement, $0) }, reportError: reportError) },
            scrollFrameToVisible: scrollFrameToVisible,
            readFrameAttribute: { fresh in
                clippingFrameAttribute(uncached: fresh,
                    read: { environment.read(axElement, .frame) }, reportError: reportError)
            }, clippingFrame: { fresh in
                clippingFrame(uncached: fresh, transaction: transaction, environment: environment, reportError: reportError)
            })
    }
}
