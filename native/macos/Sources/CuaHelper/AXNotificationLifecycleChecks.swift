import ApplicationServices
import Foundation

// Real AXObserver + real RunLoopTask, with no subscriptions or UI actions.
func runAXNotificationLifecycleChecks() async throws {
    let observer = try AXNotificationObserver(processID: getpid()) { _ in
        preconditionFailure("No notifications were registered")
    }
    observer.startMonitoring(qos: .utility)
    let source = AXObserverGetRunLoopSource(observer.axObserver)
    func installedLoop() async throws -> CFRunLoop {
        let deadline = ContinuousClock.now.advanced(by: .seconds(3))
        while ContinuousClock.now < deadline {
            if let loop = observer.monitoringRunLoop,
                CFRunLoopContainsSource(loop, source, .defaultMode) { return loop }
            try await Task.sleep(for: .milliseconds(10))
        }
        throw UIElementError.failedInit("AX notification source did not enter the RunLoop")
    }
    let first = try await installedLoop()
    observer.startMonitoring(qos: .userInitiated)
    precondition(observer.monitoringRunLoop === first)
    observer.stopMonitoring()
    precondition(observer.monitoringRunLoop == nil)
    precondition(!CFRunLoopContainsSource(first, source, .defaultMode))
    observer.stopMonitoring()
    observer.startMonitoring(qos: .utility)
    let second = try await installedLoop()
    precondition(second !== first)
    observer.stopMonitoring()
    precondition(!CFRunLoopContainsSource(second, source, .defaultMode))
}
