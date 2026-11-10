import ApplicationServices

@main struct SkyRPCFailureTests {
    static func main() {
        for raw: Int32 in [-25214, -25204, -25202, -25200, 42, Int32.min, Int32.max] {
            let status = AXError(rawValue: raw)!
            let wire = SkyRPCFailure.accessibility(status)
            precondition(wire.code == -10008 && wire.message == String(raw))
            precondition(NativeIPCClientError.mappedServerError(errorNumber: Int32(wire.code), errorString: wire.message) == .accessibilityError(status))
        }
        for code in ["STALE_OBSERVATION", "PROVIDER_DISCONNECTED", "ACTION_OUTCOME_UNKNOWN", "TARGET_NOT_FOUND", "AMBIGUOUS_TARGET", "OTHER"] {
            let wire = SkyRPCFailure.hostFailure(code: code, message: "Observe again; prior state is unavailable.")
            precondition(wire.code == -10005)
            precondition(NativeIPCClientError.mappedServerError(errorNumber: Int32(wire.code), errorString: wire.message) == .serverError(errorNumber: -10005, errorString: wire.message))
        }
        for (code, expected) in [("PERMISSION_DENIED", -10009), ("INVALID_ARGUMENT", -32602), ("SCREEN_LOCKED", -10020)] {
            precondition(SkyRPCFailure.hostFailure(code: code, message: "payload") == SkyRPCFailure(code: expected, message: "payload"))
        }
        let locked = SkyRPCFailure.hostFailure(code: "SCREEN_LOCKED", message: "Unlock desktop before input")
        precondition(NativeIPCClientError.mappedServerError(errorNumber: Int32(locked.code),
            errorString: locked.message) == .screenLocked(message: locked.message))
        print("native Sky error projection and client decoding passed")
    }
}
