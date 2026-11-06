import ApplicationServices

@main
struct AXProcessIDTests {
    static func main() throws {
        for returned: pid_t in [-1, 0, 12345] {
            let value = try copiedAXProcessID { output in
                precondition(output == -1)
                output = returned
                return .success
            }
            precondition(value == returned)
        }
        let unchanged = try copiedAXProcessID { _ in .success }
        precondition(unchanged == -1)
        for error in [AXError.noValue, .cannotComplete, .invalidUIElement, .apiDisabled] {
            do {
                _ = try copiedAXProcessID { output in output = 12345; return error }
                preconditionFailure("Failed query must not return a written PID")
            } catch UIElementError.axError(let actual) {
                precondition(actual == error)
            }
            let optional = try? copiedAXProcessID { _ in error }
            precondition(optional == nil)
        }
        // GetPid reads identity only, not another application's accessibility tree.
        let ownElement = AXUIElementCreateApplication(getpid())
        precondition(resolvedAXProcessID(ownElement) == getpid())
        print("native PID query preserves success values, throws AX errors and resolves current process")
    }
}
