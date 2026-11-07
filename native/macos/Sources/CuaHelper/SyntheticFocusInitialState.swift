// Selection order of 0x100750594, with native querying/owner resolution left
// explicit. A present preventer cache bypasses all process and workspace reads.
func initialSyntheticFocusState(
    targetIsActive: Bool, targetPID: Int32,
    preventerFocusPID: () -> Int32?,
    queryKeyFocusPID: () -> Int32?,
    resolveFocusOwnerPID: (Int32) -> Int32,
    workspaceFrontmostPID: () -> Int32?
) -> SyntheticApplicationFocusState {
    let owner: Int32
    if let cached = preventerFocusPID() { owner = cached }
    else if let queried = queryKeyFocusPID() { owner = resolveFocusOwnerPID(queried) }
    else { owner = workspaceFrontmostPID() ?? 0 }
    return SyntheticApplicationFocusState(applicationIsActive: targetIsActive,
        applicationHasKeyFocus: owner == targetPID)
}
