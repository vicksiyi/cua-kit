import ApplicationServices
import Foundation

@main
struct AXAttributeWritingTests {
    static func main() throws {
        let attribute = UIElementAttribute("AXDisclosing")
        let objects: [AnyObject] = [NSNumber(value: true), NSNumber(value: false),
            "text" as NSString, ["value"] as NSArray, AXUIElementCreateSystemWide()]
        for object in objects {
            var calls = 0
            try systemAXAttributeWriteResult(AXEncodedValue(value: object), for: attribute) { name, value in
                precondition(name === attribute.name && value === object)
                calls += 1
                return .success
            }
            precondition(calls == 1)
        }
        for status: AXError in [.failure, .illegalArgument, .invalidUIElement,
            .invalidUIElementObserver, .cannotComplete, .attributeUnsupported, .actionUnsupported,
            .notificationUnsupported, .notImplemented, .notificationAlreadyRegistered,
            .notificationNotRegistered, .apiDisabled, .noValue, .parameterizedAttributeUnsupported,
            .notEnoughPrecision] {
            var calls = 0
            do {
                try systemAXAttributeWriteResult(AXEncodedValue(value: NSNumber(value: true)), for: attribute) { _, _ in
                    calls += 1; return status
                }
                fatalError("write must throw every non-success status")
            } catch UIElementError.axError(let actual) {
                precondition(actual == status && calls == 1)
                // Compose the production strict writer with the IPC projection
                // and native client mapping; the raw status must survive.
                let wire = SkyRPCFailure.accessibility(actual)
                precondition(NativeIPCClientError.mappedServerError(
                    errorNumber: Int32(wire.code), errorString: wire.message) == .accessibilityError(status))
            }
        }
        print("native writes preserve encoded identity and reject every AX error")
    }
}
