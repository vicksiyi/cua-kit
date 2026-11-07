// 0x10075169c..0x100751738: prefer focused window, read main only when
// focused window is absent. PID read failure does not retry the other window.
func focusOwnerWindowPID<Window>(
    focusedWindow: () -> Window?, mainWindow: () -> Window?,
    readPID: (Window) throws -> Int32, reportError: (Error) -> Void
) -> Int32? {
    guard let window = focusedWindow() ?? mainWindow() else { return nil }
    do { return try readPID(window) }
    catch { reportError(error); return nil }
}
