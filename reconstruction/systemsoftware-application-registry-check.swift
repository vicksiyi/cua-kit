import Carbon
import CoreGraphics
import Darwin
import RunningProcess
import SystemSoftware

@main struct Check {
    static func main() {
        var processA = ProcessSerialNumber(highLongOfPSN: 0, lowLongOfPSN: 2)
        var processB = processA
        var pidA: Int32 = -1, pidB: Int32 = -1
        let statusA = ApplicationRegistrySPI.getProcessPID(&processA, pid: &pidA)
        let statusB = CoreCUAGetProcessPID(&processB, &pidB)
        precondition(statusA == statusB)
        if statusA == 0 { precondition(pidA == pidB) }
        processA = ProcessSerialNumber(highLongOfPSN: 0, lowLongOfPSN: 0)
        processB = processA
        let lookupA = ApplicationRegistrySPI.getProcessForPID(getpid(), process: &processA)
        let lookupB = CoreCUAGetProcessForPID(getpid(), &processB)
        precondition(lookupA == lookupB)
        if lookupA == 0 {
            precondition(processA.highLongOfPSN == processB.highLongOfPSN && processA.lowLongOfPSN == processB.lowLongOfPSN)
        }
        print("Application registry public Carbon forwarding checks passed (pid status \(statusA), lookup status \(lookupA)); no focus/activation SPI")
    }
}

// Compile-only original private-SPI API shapes; do not invoke.
func checkApplicationRegistryAPIs(_ process: UnsafeMutablePointer<ProcessSerialNumber>,
    flag: UnsafeMutablePointer<DarwinBoolean>) {
    let _: Int32 = ApplicationRegistrySPI.getKeyFocusProcess(process, flag: flag)
    let _: Int32 = ApplicationRegistrySPI.releaseKeyFocus(withID: 0)
    let _: CGError = ApplicationRegistrySPI.setFrontProcess(process, windowID: 0, options: 0)
    let _: Int32 = ApplicationRegistrySPI.setApplicationDesiresAttention(process, false)
}
