import Carbon
import AppKit

// Query order/error handling from 0x10074ffcc. PID conversion occurs even if
// the focus query fails. The exceptional -600 path recognizes an unregistered
// ViewBridge process only when the returned focus flag is false.
func queryRegistryKeyFocusPID(
    getFocus: (UnsafeMutablePointer<ProcessSerialNumber>, UnsafeMutablePointer<DarwinBoolean>) -> Int32,
    getPID: (UnsafeMutablePointer<ProcessSerialNumber>, UnsafeMutablePointer<Int32>) -> Int32,
    viewBridgePID: () -> Int32?, applicationExists: (Int32) -> Bool,
    reportFailure: (Int32, Int32) -> Void
) -> Int32? {
    var process = ProcessSerialNumber(highLongOfPSN: 0, lowLongOfPSN: 0)
    var flag = DarwinBoolean(false)
    let focusStatus = getFocus(&process, &flag)
    var pid: Int32 = 0
    let pidStatus = getPID(&process, &pid)
    if pidStatus == -600 && focusStatus == 0 && !flag.boolValue,
       let auxiliary = viewBridgePID(), !applicationExists(auxiliary) { return auxiliary }
    guard focusStatus == 0 && pidStatus == 0 else {
        reportFailure(focusStatus, pidStatus); return nil
    }
    return pid
}

func systemRegistryKeyFocusPID(reportFailure: (Int32, Int32) -> Void) -> Int32? {
    queryRegistryKeyFocusPID(getFocus: ApplicationRegistrySPI.getKeyFocusProcess,
        getPID: ApplicationRegistrySPI.getProcessPID, viewBridgePID: viewBridgeAuxiliaryFocusPID,
        applicationExists: { NSRunningApplication(processIdentifier: $0) != nil }, reportFailure: reportFailure)
}
