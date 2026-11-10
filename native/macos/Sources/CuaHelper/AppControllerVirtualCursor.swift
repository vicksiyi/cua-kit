import AppKit

extension Target {
    // Native createVirtualCursorIfNeeded0x10006ecd8. Cache before binding the
    // application monitor; a cached cursor is returned without recreating its
    // style, changing its PID or rebuilding its monitor.
    func createVirtualCursorIfNeeded(make: (() -> ComputerUseCursor)? = nil,
        bind: ((ComputerUseCursor, pid_t) -> Void)? = nil
    ) -> ComputerUseCursor {
        if let virtualCursor { return virtualCursor }
        let cursor = make?() ?? ComputerUseCursor(style: ComputerUseCursorStyle.current(),
            motionConfiguration: .live)
        virtualCursor = cursor
        if let bind { bind(cursor, app.processIdentifier) }
        else { cursor.setCorrespondingApplication(pid: app.processIdentifier) }
        return cursor
    }
}
