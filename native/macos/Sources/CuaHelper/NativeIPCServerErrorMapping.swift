import ApplicationServices

extension NativeIPCClientError {
    /// Pinned throwMappedServerError implementation 0x100de6d98..<0x100de75bc.
    /// Unrecognized codes/payloads retain both original code and message.
    static func mappedServerError(errorNumber: Int32, errorString: String) -> Self {
        switch errorNumber {
        case -10006: return .appNotAllowed(bundleIdentifier: errorString)
        case -10007: return .runningApplicationNotFound(bundleIdentifier: errorString)
        case -10008:
            if let raw = Int32(errorString) { return .accessibilityError(AXError(rawValue: raw)!) }
        case -10009: return .permissionsNotGranted
        case -10010: return .invalidApp(errorString)
        case -10011: return .noActiveSession(app: errorString)
        case -10012: return .userStoppedSession(app: errorString)
        case -10014: return .permissionsPending
        case -10015: return .blockedURL(url: errorString)
        case -10016: return .userIntervened(message: errorString)
        case -10018: return .ambiguousApp(message: errorString)
        case -10020: return .screenLocked(message: errorString)
        case -10021: return .turnEnded
        case -10022: return .messagesPermissionsPending
        case -10023: return .messagesPermissionsDenied
        case -10024: return .messagesQueryTimedOut
        case -10025: return .messagesInvalidRequest(errorString)
        case -10026: return .messagesAmbiguousDestination(errorString)
        case -10027:
            if let reason = SendPlanUnavailableReason(rawValue: errorString) {
                return .messagesSendPlanUnavailable(reason)
            }
        case -10028: return .messagesSendOutcomeUncertain
        case -10029: return .messagesSendRateLimited(message: errorString)
        case -10030: return .calendarPermissionsPending
        case -10031: return .calendarPermissionsDenied
        case -10032: return .calendarInvalidRequest(errorString)
        default: break
        }
        return .serverError(errorNumber: errorNumber, errorString: errorString)
    }

    static func throwMappedServerError(errorNumber: Int32, errorString: String) throws {
        throw mappedServerError(errorNumber: errorNumber, errorString: errorString)
    }
}
