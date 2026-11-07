// Restricted element path 0x100751614..0x100751838. Only existing running
// applications with a non-prohibited policy resolve directly. Otherwise try
// window PID, then continue to the common missing-element fallback.
func restrictedFocusOwnerPID(
    applicationPID: () throws -> Int32,
    windowPID: () -> Int32?,
    activationPolicy: (Int32) -> Int?,
    fallback: () -> Int32,
    reportError: (Error) -> Void
) -> Int32 {
    do {
        let pid = try applicationPID()
        if let policy = activationPolicy(pid), policy != 2 { return pid }
    } catch { reportError(error) }
    if let pid = windowPID(), let policy = activationPolicy(pid), policy != 2 { return pid }
    return fallback()
}
