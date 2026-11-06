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
        for status in [AXError.success, .noValue, .cannotComplete, .apiDisabled] {
            for present in [false, true] {
                do {
                    let value = try rawAXParameterizedAttributeResult { output in
                        precondition(output == nil)
                        if present { output = "parameterized" as CFString }
                        return status
                    }
                    precondition(status == .success)
                    precondition((value as? String) == (present ? "parameterized" : nil))
                } catch UIElementError.axError(let actual) {
                    precondition(status != .success && actual == status)
                } catch { preconditionFailure("Unexpected parameterized read error: \(error)") }
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
            do {
                let _: CFTypeRef? = try onAXAttributeReadThread(targetPID: getpid()) {
                    precondition(Thread.isMainThread)
                    return try rawAXParameterizedAttributeResult { _ in .cannotComplete }
                }
                preconditionFailure("Expected parameterized read to throw across main.sync")
            } catch UIElementError.axError(let status) {
                precondition(status == .cannotComplete)
            } catch { preconditionFailure("Unexpected dispatch error: \(error)") }
            done.signal()
        }
        // Pump main rather than block it: the worker must really execute main.sync.
        let deadline = Date().addingTimeInterval(5)
        while done.wait(timeout: .now()) != .success {
            precondition(Date() < deadline, "AX main-queue dispatch did not complete")
            RunLoop.main.run(until: Date().addingTimeInterval(0.01))
        }
        print("native AX raw status/value, parameterized throwing and real main-queue scheduling checks passed")
    }
}
