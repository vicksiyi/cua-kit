import ApplicationServices

// Direct query result handling at 0x1006fa02c..0x1006fa080. The optional
// caller at 0x1006fa0d4 catches query errors; its logging and MockProvider
// dispatch are not implemented here. No per-element PID cache is assumed.
func copiedAXProcessID(copy: (inout pid_t) -> AXError) throws -> pid_t {
    var pid: pid_t = -1
    let error = copy(&pid)
    guard error == .success else { throw UIElementError.axError(error) }
    return pid
}

func resolvedAXProcessID(_ element: AXUIElement) -> pid_t? {
    try? copiedAXProcessID { AXUIElementGetPid(element, &$0) }
}
