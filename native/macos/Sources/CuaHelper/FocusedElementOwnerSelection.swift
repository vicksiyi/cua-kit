// Common resolver's element stage 0x100751470..0x100751568. A missing app
// object follows restricted resolution; it does not immediately return AX PID.
func focusedElementOwnerPID<Element>(
    element: Element?, readPID: (Element) throws -> Int32,
    activationPolicy: (Int32) -> Int?,
    resolveRestrictedPID: (Int32) -> Int32,
    missingElementFallback: () -> Int32,
    reportError: (Error) -> Void
) -> Int32 {
    guard let element else { return missingElementFallback() }
    let pid: Int32
    do { pid = try readPID(element) }
    catch { reportError(error); return missingElementFallback() }
    if let policy = activationPolicy(pid), policy != 2 { return pid }
    return resolveRestrictedPID(pid)
}
