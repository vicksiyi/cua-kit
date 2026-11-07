import ApplicationServices

/// Native AXError.debugDescription getter 0x100255188..<0x1002553b4.
/// Keep this scoped helper rather than adding a retroactive SDK conformance.
enum NativeAXErrorDescription {
    static func describe(_ error: AXError) -> String {
        switch error.rawValue {
        case 0: return "AXError.success"
        case -25214: return "AXError.notEnoughPrecision"
        case -25213: return "AXError.parameterizedAttributeUnsupported"
        case -25212: return "AXError.noValue"
        case -25211: return "AXError.apiDisabled"
        case -25210: return "AXError.notificationNotRegistered"
        case -25209: return "AXError.notificationAlreadyRegistered"
        case -25208: return "AXError.notImplemented"
        case -25207: return "AXError.notificationUnsupported"
        case -25206: return "AXError.actionUnsupported"
        case -25205: return "AXError.attributeUnsupported"
        case -25204: return "AXError.cannotComplete"
        case -25203: return "AXError.invalidUIElementObserver"
        case -25202: return "AXError.invalidUIElement"
        case -25201: return "AXError.illegalArgument"
        case -25200: return "AXError.failure"
        default: return "(undocumented AXError)"
        }
    }
}

extension NativeIPCClientError: CustomStringConvertible {
    var description: String {
        switch self {
        case .noActiveSession, .userStoppedSession, .userIntervened, .screenLocked, .permissionsPending:
            return interruptionDescription!
        case let .serverError(number, message): return "Computer Use server error \(number): \(message)"
        case let .invalidApp(app): return "Invalid app: \(app)"
        case let .ambiguousApp(message), let .messagesSendRateLimited(message): return message
        case let .appNotAllowed(id): return "Computer Use is not allowed to use the app '\(id)' for safety reasons."
        case let .runningApplicationNotFound(id): return "Running application not found: \(id)"
        case let .accessibilityError(error): return "Accessibility error: \(NativeAXErrorDescription.describe(error))"
        case let .messagesInvalidRequest(message): return "Invalid Messages request: \(message)"
        case let .messagesAmbiguousDestination(message): return "Ambiguous Messages destination: \(message)"
        case let .calendarInvalidRequest(message): return "Invalid Calendar request: \(message)"
        case let .messagesSendPlanUnavailable(reason):
            if reason == .alreadyConsumed { return "Messages send plan was already consumed. Delivery may already have occurred." }
            return "Messages send plan is unavailable (\(reason.rawValue))."
        case .blockedURL: return "This session has been stopped because Computer Use is not allowed on the current browser URL. Stop your work and send a final message noting why the session has been ended. Note that Computer Use is not allowed on this URL even if the user navigates to it themselves."
        case .couldNotFindServiceApp: return "Computer Use could not start because its runtime app is missing. Try again, and if it fails after 2 more tries, suggest that the user relaunch ChatGPT."
        case .permissionsNotGranted: return "Computer Use permissions are not granted"
        case .turnEnded: return "Computer Use is unavailable because the current turn ended. It will work again after the next user message."
        case .messagesPermissionsPending: return "Messages permission setup is still open."
        case .messagesPermissionsDenied: return "Required Messages permissions were not granted."
        case .messagesQueryTimedOut: return "The Messages database query exceeded its time limit."
        case .messagesSendOutcomeUncertain: return "Messages could not verify whether the send completed. Sending again could duplicate the message."
        case .calendarPermissionsPending: return "Calendar permissions are pending"
        case .calendarPermissionsDenied: return "Calendar permissions are not granted"
        }
    }
}
