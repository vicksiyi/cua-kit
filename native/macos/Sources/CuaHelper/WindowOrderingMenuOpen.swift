// menuDidOpen 0x100788190..0x1007884ac. Always cancel/clear the previous
// menu task first, then snapshot observed IDs under a separate lock scope.
func openWindowOrderingMenu<Handle, Application>(store: WindowOrderingObserverTaskStore<Handle>,
    windowOwnerPID: (UInt32) -> Int32?, frontmostApplication: () -> Application?,
    processIdentifier: (Application) -> Int32,
    makeTask: (Int32, [UInt32]) -> Handle) {
    store.menuDidClose()
    let ids = store.observedWindowIDs
    var owners = Set<Int32>()
    for id in ids {
        if let pid = windowOwnerPID(id) { owners.insert(pid) }
    }
    guard !owners.isEmpty, let application = frontmostApplication(),
          !owners.contains(processIdentifier(application)) else { return }
    // The source reads the PID again for capture; do not cache the first read.
    let pid = processIdentifier(application)
    store.withState { $0.menuTask = makeTask(pid, ids) }
}
