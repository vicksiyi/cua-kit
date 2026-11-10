import ApplicationServices

extension UIElement {
    // The original no-argument getter explicitly requests scrollToVisible:false.
    // Keep that invariant separate from the explicit scrolling provider API;
    // the no-argument getter must never invoke scrolling.
    func systemClickablePoint(
        transaction: UIElementTransactionCache?, reportError: (Error) -> Void
    ) async throws -> CGPoint? {
        try await uiElementClickablePoint { scrollToVisible in
            try await clickablePoint(scrollToVisible: scrollToVisible,
                transaction: transaction, environment: .system,
                preferredPoint: { systemChessPreferredPoint(transaction: transaction, reportError: reportError) },
                scrollFrameToVisible: { _ in preconditionFailure("No-argument clickablePoint must never request scrolling") },
                reportError: reportError)
        }
    }
}
