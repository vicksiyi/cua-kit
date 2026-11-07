import ApplicationServices

// 0x1007884b0..0x100788d60. Capture the selected app's focused AX window/ID
// once. Poll ordering at 5ms intervals, up to 20 times; a watched window ahead
// of the focused window triggers one full AXRaise attempt, then task exit.
func runWindowOrderingMenuTask<Window>(observedWindowIDs: [UInt32],
    focusedWindow: () -> Window?, windowID: (Window) throws -> UInt32,
    onScreenWindowIDs: () -> [UInt32], raise: (Window) throws -> Void,
    sleep: (Duration) async throws -> Void = { try await Task.sleep(for: $0, clock: .continuous) }) async {
    guard let focused = focusedWindow(), let focusedID = try? windowID(focused) else { return }
    for _ in 0..<20 {
        do { try await sleep(.milliseconds(5)) }
        catch { return }
        let ordering = onScreenWindowIDs()
        guard let index = ordering.firstIndex(of: focusedID) else { continue }
        if observedWindowIDs.contains(where: { id in
            ordering.firstIndex(of: id).map { $0 < index } ?? false
        }) {
            try? raise(focused)
            return
        }
    }
}

func runNativeWindowOrderingMenuTask(pid: Int32, observedWindowIDs: [UInt32],
    reportError: (Error) -> Void) async {
    let application = UIElement(element: AXUIElementCreateApplication(pid))
    await runWindowOrderingMenuTask(observedWindowIDs: observedWindowIDs,
        focusedWindow: {
            application.focusedWindowValue(transaction: UIElementTreeTransaction.current?.cache, reportError: reportError)
        }, windowID: { try $0.axElement.windowID },
        onScreenWindowIDs: { onScreenMouseWindowIDs() }, raise: { try $0.perform(action: .raise) })
}
