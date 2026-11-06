import Foundation
import ApplicationServices

@main
struct AXAttributeReadingTests {
    static func main() {
        for status in [AXError.success, .noValue, .cannotComplete, .apiDisabled] {
            for present in [false, true] {
                let result = rawAXAttributeResult { output in
                    precondition(output == nil)
                    if present { output = "preserved" as CFString }
                    return status
                }
                precondition(result.error == status)
                precondition((result.value as? String) == (present ? "preserved" : nil))
            }
        }
        precondition(Thread.isMainThread)
        precondition(onAXAttributeReadThread(targetPID: getpid()) { Thread.isMainThread })
        let done = DispatchSemaphore(value: 0)
        DispatchQueue.global().async {
            precondition(!Thread.isMainThread)
            precondition(onAXAttributeReadThread(targetPID: getpid()) { Thread.isMainThread })
            precondition(!onAXAttributeReadThread(targetPID: nil) { Thread.isMainThread })
            precondition(!onAXAttributeReadThread(targetPID: -1) { Thread.isMainThread })
            done.signal()
        }
        // Pump main rather than block it: the worker must really execute main.sync.
        let deadline = Date().addingTimeInterval(5)
        while done.wait(timeout: .now()) != .success {
            precondition(Date() < deadline, "AX main-queue dispatch did not complete")
            RunLoop.main.run(until: Date().addingTimeInterval(0.01))
        }
        print("native AX raw status/value and real main-queue scheduling checks passed")
    }
}
