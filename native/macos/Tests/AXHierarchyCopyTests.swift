import Foundation
import ApplicationServices

@main struct Test {
    static func main() {
        let dictionary = ["value": "kept"] as CFDictionary
        for pid: pid_t? in [nil, 1, 2] {
            for main in [false, true] {
                for status in [AXError.success, .failure] {
                    var mainChecks = 0, dispatches = 0, copies = 0
                    var insideDispatch = false
                    let result = copiedAXHierarchy(elementPID: pid, currentPID: 1,
                        isMainThread: { mainChecks += 1; return main },
                        onMain: { body in
                            dispatches += 1; insideDispatch = true
                            defer { insideDispatch = false }
                            return body()
                        }, copy: { output in
                            copies += 1
                            precondition(insideDispatch == (pid == 1 && !main))
                            precondition(output == nil)
                            output = .passRetained(dictionary)
                            return status
                        })
                    precondition(result === dictionary)
                    precondition(copies == 1 && mainChecks == (pid == 1 ? 1 : 0))
                    precondition(dispatches == (pid == 1 && !main ? 1 : 0))
                }
            }
        }
        for status in [AXError.success, .failure] {
            let result = copiedAXHierarchy(elementPID: nil, currentPID: 1,
                isMainThread: { preconditionFailure() },
                onMain: { _ in preconditionFailure() }, copy: { _ in status })
            precondition(result == nil)
        }
        print("Hierarchy copy routing and retained output handling passed")
    }
}
