import AppKit
import ApplicationServices

func restoreWindowOrderingChange<Application, Window>(windowID: UInt32, ownerPID: Int32,
    observedWindowIDs: () -> [UInt32], frontmostApplication: () -> Application?,
    processIdentifier: (Application) -> Int32, focusedWindow: (Application) -> Window?,
    restore: (Window) async throws -> Void) async throws {
    guard let context = windowOrderingRestorationContext(windowID: windowID, ownerPID: ownerPID,
        observedWindowIDs: observedWindowIDs, frontmostApplication: frontmostApplication,
        processIdentifier: processIdentifier, focusedWindow: focusedWindow) else { return }
    defer { withExtendedLifetime(context.application) {} }
    try await restore(context.window)
}

// Native composition of 0x10078abf8: restore the OTHER foreground app's
// focused window through the existing full action dispatcher, not raw AXRaise.
// The caller still owns the main event loop/menu policy and its cancellation.
func restoreNativeWindowOrderingAfterChange(_ change: NativeWindowDescription,
    observedWindowIDs: () -> [UInt32], reportError: @escaping (Error) -> Void) async throws {
    try await restoreWindowOrderingChange(windowID: change.id, ownerPID: change.ownerPID,
        observedWindowIDs: observedWindowIDs,
        frontmostApplication: { NSWorkspace.shared.frontmostApplication },
        processIdentifier: { $0.processIdentifier }, focusedWindow: { application in
            let root = UIElement(element: AXUIElementCreateApplication(systemResolvedProcessIdentifier(application)))
            return root.focusedWindowValue(transaction: UIElementTreeTransaction.current?.cache, reportError: reportError)
        }, restore: { window in
            try await performWindowOrderingRaiseScope(onScreenWindowIDs: { onScreenMouseWindowIDs() },
                makeObserver: { ids, events, changed in
                    NativeCGWindowObserver(windowIDs: ids, events: events) { _, _ in changed() }
                }, raise: { try window.perform(action: .raise) }, reportRaiseError: reportError)
        })
}
