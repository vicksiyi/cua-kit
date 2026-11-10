#if canImport(SystemSoftware)
import SystemSoftware
#endif
// Entry guards of 0x10078acd8..0x10078af48. Ignore windows outside the
// current observed-ID list and windows owned by the current foreground app.
// Only another foreground app's focused AX window can enter restoration;
// there is no main-window/last-window fallback at this boundary.
func windowOrderingRestorationContext<Application, Window>(windowID: UInt32, ownerPID: Int32,
    observedWindowIDs: () -> [UInt32], frontmostApplication: () -> Application?,
    processIdentifier: (Application) -> Int32, focusedWindow: (Application) -> Window?)
    -> (application: Application, window: Window)? {
    guard observedWindowIDs().contains(windowID), let application = frontmostApplication(),
          processIdentifier(application) != ownerPID, let window = focusedWindow(application) else { return nil }
    return (application, window)
}

// Main observer subscription at 0x100789298..0x1007893bc. Raw static event
// array holds declaration tag 8 (didChangeOrder); imported enum-case metadata
// identifies bufferingNewest and its stored capacity is one.
func orderingWindowEventStream<Window, Observer>(observedWindowIDs: [UInt32],
    makeObserver: @escaping ([UInt32], [WindowServerEvent], @escaping @Sendable (Window, WindowServerEvent) -> Void) -> Observer)
    -> CGWindowEventStream<Window, Observer> {
    CGWindowEventStream(windowIDs: observedWindowIDs, events: [.didChangeOrder],
        bufferingPolicy: .bufferingNewest(1), makeObserver: makeObserver)
}
