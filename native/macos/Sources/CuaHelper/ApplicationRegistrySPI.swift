import Carbon

import RunningProcess

// Source wrappers 0x10026d7fc/26d800 share the primary lazy symbol batch with
// WindowServerSPI. Reuse its slot 7 binding (_SLPSGetKeyFocusProcess).
enum ApplicationRegistrySPI {
    static func getKeyFocusProcess(_ process: UnsafeMutablePointer<ProcessSerialNumber>,
                                   flag: UnsafeMutablePointer<DarwinBoolean>) -> Int32 {
        WindowServerSPI.getKeyFocusProcess(process, flag: flag)
    }
    static func releaseKeyFocus(withID id: UInt32) -> Int32 {
        WindowServerSPI.releaseKeyFocus(withID: id)
    }
    // 0x10026d7f8 directly forwards the public Carbon function.
    static func getProcessForPID(_ pid: Int32,
        process: UnsafeMutablePointer<ProcessSerialNumber>) -> Int32 {
        CoreCUAGetProcessForPID(pid, process)
    }
    static func getProcessPID(_ process: UnsafeMutablePointer<ProcessSerialNumber>,
                              pid: UnsafeMutablePointer<Int32>) -> Int32 {
        CoreCUAGetProcessPID(process, pid)
    }
}
