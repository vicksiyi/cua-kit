import Foundation

// This lease only retains immutable object references; it never invokes or
// mutates resources from the task. ARC retention/release can cross executors.
private final class FocusStealCallbackResourceLease: @unchecked Sendable {
    private let resources: [AnyObject]
    init(_ resources: [AnyObject]) { self.resources = resources }
}

struct FocusStealRegistrationCallbacks: Sendable {
    let pid: Int32
    let lost: (@Sendable () -> Void)?
    let gained: (@Sendable () -> Void)?
    private let resourceLease: FocusStealCallbackResourceLease
    init(pid: Int32, lost: (@Sendable () -> Void)?, gained: (@Sendable () -> Void)?,
         retaining resources: [AnyObject] = []) {
        self.pid = pid; self.lost = lost; self.gained = gained
        resourceLease = FocusStealCallbackResourceLease(resources)
    }
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
        // Native task context copies the whole registration (including taps).
        // Retain that snapshot even if the callback unregisters itself.
        withExtendedLifetime(registration) {
            // 0x10074ec90/0x10074ecf4 return true when the handler is absent.
            guard let callback else {
                reportMissingHandler(registration.pid, transition)
                return true
            }
            callback()
            return false
        }
    }
}
