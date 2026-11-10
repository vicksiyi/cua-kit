import SystemSoftware
import Carbon
import ApplicationServices

// Window/sheet creation callback: failed AX PID or PSN lookup is ignored;
// successful lookup clears attention. The native setter's status is ignored.
func clearAppControllerAttention(processID: () throws -> Int32,
    getProcess: (Int32, UnsafeMutablePointer<ProcessSerialNumber>) -> Int32,
    setAttention: (UnsafeMutablePointer<ProcessSerialNumber>, Bool) -> Int32) {
    var process = ProcessSerialNumber(highLongOfPSN: 0, lowLongOfPSN: 0)
    guard let pid = try? processID(), getProcess(pid, &process) == 0 else { return }
    _ = setAttention(&process, false)
}

func clearNativeAppControllerAttention(_ application: AXUIElement) {
    clearAppControllerAttention(processID: { try application.pid },
        getProcess: { ApplicationRegistrySPI.getProcessForPID($0, process: $1) },
        setAttention: ApplicationRegistrySPI.setApplicationDesiresAttention)
}
