import ApplicationServices

@main
struct AXActionPerformingTests {
    static func main() throws {
        precondition(AXError.cannotComplete.rawValue == -25204)
        precondition(AXError.attributeUnsupported.rawValue == -25205)
        for status: AXError in [.success, .cannotComplete, .attributeUnsupported] {
            var calls = 0
            try systemAXActionResult { calls += 1; return status }
            precondition(calls == 1)
        }
        for status: AXError in [.failure, .illegalArgument, .invalidUIElement,
                                .invalidUIElementObserver, .actionUnsupported, .notificationUnsupported,
                                .notImplemented, .notificationAlreadyRegistered, .notificationNotRegistered,
                                .apiDisabled, .noValue, .parameterizedAttributeUnsupported, .notEnoughPrecision] {
            var calls = 0
            do {
                try systemAXActionResult { calls += 1; return status }
                fatalError("unexpected tolerated AX error")
            } catch UIElementError.axError(let actual) {
                precondition(actual == status && calls == 1)
            }
        }
        print("native action status policy preserves tolerated and throwing errors without retries")
    }
}
