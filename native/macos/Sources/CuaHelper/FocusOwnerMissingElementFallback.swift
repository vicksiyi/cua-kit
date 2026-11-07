// Missing-element stage 0x100751838..0x100751a3c. ViewBridge sets the skip
// flag; other callers may resolve an application owner before workspace fallback.
func focusOwnerPIDWithoutElement(
    skipApplicationOwner: Bool,
    applicationOwnerPID: () -> Int32?,
    workspaceFrontmostPID: () -> Int32?
) -> Int32 {
    if !skipApplicationOwner, let pid = applicationOwnerPID() { return pid }
    return workspaceFrontmostPID() ?? 0
}
