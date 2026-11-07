// Dispatch portion of 0x10075027c. Native resolver result payload/AX fallback
// adapters remain separate; only the selected owner's PID is exposed here.
func selectKeyFocusOwnerPID(
    _ pid: Int32,
    viewBridgePID: () -> Int32? = viewBridgeAuxiliaryFocusPID,
    resolveViewBridge: (Int32) -> Int32,
    activationPolicy: (Int32) -> Int?,
    resolveProhibitedApplication: (Int32) -> Int32
) -> Int32 {
    if let auxiliary = viewBridgePID(), auxiliary == pid { return resolveViewBridge(pid) }
    // NSApplication.ActivationPolicy.prohibited is raw value 2.
    guard activationPolicy(pid) == 2 else { return pid }
    return resolveProhibitedApplication(pid)
}
