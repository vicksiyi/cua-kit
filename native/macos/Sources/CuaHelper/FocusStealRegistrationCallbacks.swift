import Foundation

struct FocusStealRegistrationCallbacks: Sendable {
    let pid: Int32
    let lost: (@Sendable () -> Void)?
    let gained: (@Sendable () -> Void)?
}

// 0x10074d7e0..0x10074dd2c creates an unstructured task for each selected
// record. Do not invoke callbacks inline under the system-state lock, or
// replace this with a detached task (which loses inherited task context).
// Selection order is registration order; task completion order is not promised.
@discardableResult
func scheduleFocusStealRegistrationCallback(
    _ registration: FocusStealRegistrationCallbacks,
    transition: FocusStealRegistrationTransition,
    reportMissingHandler: @escaping @Sendable (Int32, FocusStealRegistrationTransition) -> Void = { _, _ in }
) -> Task<Bool, Never>? {
    let callback: (@Sendable () -> Void)?
    switch transition {
    case .unchanged: return nil
    case .gained: callback = registration.gained
    case .lost: callback = registration.lost
    }
    return Task {
        // 0x10074ec90/0x10074ecf4 return true when the handler is absent.
        guard let callback else {
            reportMissingHandler(registration.pid, transition)
            return true
        }
        callback()
        return false
    }
}
