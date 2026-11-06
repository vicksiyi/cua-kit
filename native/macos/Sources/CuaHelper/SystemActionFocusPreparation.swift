import AppKit
import ApplicationServices

// No-enforcer branch at 0x1007b1348/0x1007b142c (and 0x1007b1978).
// AX PID errors propagate. Missing NSRunningApplication is tolerated. The
// isActive query is retained for fidelity, but its value does not gate the action.
func probeSystemApplicationIsActiveForAXAction(_ app: AXUIElement) throws {
    let pid = try copiedAXProcessID { AXUIElementGetPid(app, &$0) }
    _ = NSRunningApplication(processIdentifier: pid)?.isActive
}
