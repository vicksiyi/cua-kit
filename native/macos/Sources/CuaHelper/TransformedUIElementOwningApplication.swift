import AppKit

func resolveOwningApplicationBundleIdentifier(processID: () throws -> Int32,
    bundleIdentifier: (Int32) -> String?, reportError: (Error) -> Void
) -> String? {
    let pid: Int32
    do { pid = try processID() }
    catch { reportError(error); return nil }
    return bundleIdentifier(pid)
}

extension TransformedUIElement {
    // Calendar transform0x1007599e0..0x100759a2c reads this node's AX PID,
    // then NSRunningApplication.bundleIdentifier. No name/path fallback.
    func owningApplicationBundleIdentifier(reportError: (Error) -> Void) -> String? {
        resolveOwningApplicationBundleIdentifier(processID: { try axElement.pid },
            bundleIdentifier: { NSRunningApplication(processIdentifier: $0)?.bundleIdentifier },
            reportError: reportError)
    }
}
