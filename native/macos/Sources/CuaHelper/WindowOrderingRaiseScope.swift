import Atomics

// 0x10078b2e4..0x10078bce8: observe workspace-add events for a snapshot of
// on-screen window IDs before attempting AXRaise. A concurrent notification
// suppresses that attempt. Keep the temporary observer through the final sleep.
func performWindowOrderingRaiseScope<Observer>(onScreenWindowIDs: () -> [UInt32],
    makeObserver: ([UInt32], [WindowServerEvent], @escaping () -> Void) -> Observer,
    raise: () throws -> Void, reportRaiseError: (Error) -> Void,
    settle: (Duration) async throws -> Void = { try await Task.sleep(for: $0, clock: .continuous) }) async throws {
    let changed = ManagedAtomic(false)
    let observer = makeObserver(onScreenWindowIDs(), [.workspaceAddWindow]) {
        changed.store(true, ordering: .releasing)
    }
    defer { withExtendedLifetime(observer) {} }
    if !changed.load(ordering: .acquiring) {
        do { try raise() }
        catch { reportRaiseError(error) }
    }
    try await settle(.milliseconds(5))
}
