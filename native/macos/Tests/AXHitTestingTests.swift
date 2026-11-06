import ApplicationServices
import Foundation

@main struct AXHitTestingTests {
    static func main() throws {
        let ax = AXUIElementCreateApplication(424242)
        let point = CGPoint(x: 16_777_217, y: -12.125)
        for status in [AXError.success, .failure, .noValue, .attributeUnsupported, .cannotComplete, .invalidUIElement] {
            for hasResult in [false, true] {
                var copyCount = 0, constructCount = 0
                do {
                    let result: Int? = try copiedAXElementAtPoint(point, copy: { x, y, out in
                        precondition(out == nil)
                        precondition(x == 16_777_216 && y == -12.125)
                        copyCount += 1; out = hasResult ? ax : nil; return status
                    }, construct: { value in precondition(CFEqual(value, ax)); constructCount += 1; return 42 })
                    precondition(status == .success && result == (hasResult ? 42 : nil))
                } catch UIElementError.axError(let error) { precondition(error == status && status != .success) }
                precondition(copyCount == 1)
                precondition(constructCount == (status == .success && hasResult ? 1 : 0))
            }
        }
        // A successful hit enters the existing transaction-based constructor.
        let role = UIElementAttribute(kAXRoleAttribute)
        let partial = AXPartialValue(value: AXEncodedValue(value: "AXButton" as NSString), arraySubsetDescriptor: nil, textTruncationDescriptor: nil)
        let transaction = UIElementTransactionCache(attributeTable: [ax: [role: partial]], requestedAttributes: [role],
            fallbackElements: UIElementFallbackCache(initialState: [:]))
        let result = try copiedAXElementAtPoint(.zero, copy: { _, _, out in out = ax; return .success },
            construct: { UIElement(systemElement: $0, transaction: transaction) })
        precondition(result?.role == .button)
        precondition(result?.cache.transactionAttributes == [role])
        // This branch forwards nonfinite values to the AX API instead of adding
        // new validation; the actual status is still authoritative.
        let _: Int? = try copiedAXElementAtPoint(CGPoint(x: CGFloat.infinity, y: CGFloat.nan), copy: { x, y, _ in
            precondition(x.isInfinite && y.isNaN); return .success
        }, construct: { _ in fatalError() })
        print("AX hit testing preserves float conversion, strict status and transaction construction")
    }
}
