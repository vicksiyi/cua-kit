import Foundation
import ApplicationServices

@main
struct AXAttributeReadingTests {
    static func main() {
        // Enumeration intentionally preserves an output even with a nonzero
        // AX status. Do not inherit the parameterized reader's throw policy.
        let names = ["AXRole", "AXTitle", "AXRole"] as CFArray
        let empty = [] as CFArray
        precondition(decodedAXAttributeNames(nil).isEmpty)
        precondition(decodedAXAttributeNames(empty).isEmpty)
        let decodedNames = decodedAXAttributeNames(names)
        precondition(decodedNames.map { $0 as String } == ["AXRole", "AXTitle", "AXRole"])
        let unicode = ["AX名称", "", "AX名称"] as CFArray
        precondition(decodedAXAttributeNames(unicode).map { $0 as String } == ["AX名称", "", "AX名称"])
        // CFString uses foreign-reference bridging. Match Foundation's complete
        // array bridge even for malformed fixtures; do not add compactMap.
        let mixed = ["AXRole" as Any, NSNumber(value: 3)] as CFArray
        let standard = mixed as? [CFString] ?? []
        let recovered = decodedAXAttributeNames(mixed)
        precondition(recovered.count == standard.count)
        for (left, right) in zip(recovered, standard) {
            precondition(CFGetTypeID(left) == CFGetTypeID(right) && CFEqual(left, right))
        }
        for status in [AXError.success, .noValue, .cannotComplete, .apiDisabled] {
            for expected: CFArray? in [nil, empty, names] {
                var calls = 0
                let result = rawAXAttributeNamesResult { output in
                    precondition(output == nil)
                    calls += 1
                    output = expected
                    return status
                }
                precondition(calls == 1)
                if let expected {
                    precondition(result != nil && result! === expected)
                    precondition(CFArrayGetCount(result!) == CFArrayGetCount(expected))
                } else { precondition(result == nil) }
            }
        }
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
