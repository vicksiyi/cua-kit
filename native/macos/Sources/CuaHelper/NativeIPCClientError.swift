import ApplicationServices

/// Field order and associated values recovered from Error descriptor 0x1012e4c10.
/// Description and numeric mapping are implemented in companion Swift files.
enum NativeIPCClientError: Error, Equatable {
    enum SendPlanUnavailableReason: String { case missing, expired, alreadyConsumed = "already_consumed" }
    case serverError(errorNumber: Int32, errorString: String)
    case invalidApp(String)
    case ambiguousApp(message: String)
    case appNotAllowed(bundleIdentifier: String)
    case runningApplicationNotFound(bundleIdentifier: String)
    case accessibilityError(AXError)
    case noActiveSession(app: String)
    case userStoppedSession(app: String)
    case blockedURL(url: String)
    case userIntervened(message: String)
    case screenLocked(message: String)
    case messagesInvalidRequest(String)
    case messagesAmbiguousDestination(String)
    case messagesSendPlanUnavailable(SendPlanUnavailableReason)
    case messagesSendRateLimited(message: String)
    case calendarInvalidRequest(String)
    case couldNotFindServiceApp
    case permissionsNotGranted
    case permissionsPending
    case turnEnded
    case messagesPermissionsPending
    case messagesPermissionsDenied
    case messagesQueryTimedOut
    case messagesSendOutcomeUncertain
    case calendarPermissionsPending
    case calendarPermissionsDenied

    /// Native mask 0x6c0 selects payload cases 6,7,9,10; the additional
    /// empty-case discriminator 2 selects permissionsPending (not source case 16).
    var interruptionDescription: String? {
        switch self {
        case let .noActiveSession(app):
            return "Computer Use is not active for '\(app)'. You first must call `get_app_state` to get the latest state before doing other Computer Use actions. If `get_app_state` is not available in your environment, use `tool_search` to surface it."
        case .userStoppedSession:
            return "This application session has been explicitly stopped by the user for this turn. Stop your work and send a final message noting they stopped the session and you're ready to continue if they want you to. Computer Use can be used again in the next assistant turn."
        case let .userIntervened(message), let .screenLocked(message): return message
        case .permissionsPending:
            return "Computer Use permissions are still pending. The user has not finished granting Accessibility and Screen Recording permissions in the ChatGPT Computer Use window. Call this tool again, as the user is almost done finishing granting permissions. Do not end your turn yet, just call this tool again."
        default: return nil
        }
    }
}
