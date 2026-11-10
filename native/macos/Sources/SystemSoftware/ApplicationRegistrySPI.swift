import Carbon

import RunningProcess

// Source wrappers 0x10026d7fc/26d800 share the primary lazy symbol batch with
// WindowServerSPI. Reuse its slot 7 binding (_SLPSGetKeyFocusProcess).
public enum ApplicationRegistrySPI {
    // Extracted read-only diagnostic; not an original exported property.
    public static var applicationAttentionBindingAvailable: Bool { ApplicationAttentionSPI.bindingAvailable }

    private typealias KeyFocus = @convention(c) (UnsafeMutablePointer<ProcessSerialNumber>, UnsafeMutablePointer<DarwinBoolean>) -> Int32
    private typealias ReleaseFocus = @convention(c) (UInt32) -> Int32
    private typealias FrontProcess = @convention(c) (UnsafeMutablePointer<ProcessSerialNumber>, UInt32, UInt32) -> CGError
    // Original shared table slots7/8/9; reuse one required lazy resolution.
    private static let keyFocus = unsafeBitCast(WindowServerSPI.required(WindowServerSPI.functions[7]), to: KeyFocus.self)
    private static let releaseFocus = unsafeBitCast(WindowServerSPI.required(WindowServerSPI.functions[8]), to: ReleaseFocus.self)
    private static let frontProcess = unsafeBitCast(WindowServerSPI.required(WindowServerSPI.functions[9]), to: FrontProcess.self)
    public static func getKeyFocusProcess(_ process: UnsafeMutablePointer<ProcessSerialNumber>,
                                   flag: UnsafeMutablePointer<DarwinBoolean>) -> Int32 {
        keyFocus(process, flag)
    }
    public static func releaseKeyFocus(withID id: UInt32) -> Int32 {
        releaseFocus(id)
    }
    // 0x10026d7f8 directly forwards the public Carbon function.
    public static func getProcessForPID(_ pid: Int32,
        process: UnsafeMutablePointer<ProcessSerialNumber>) -> Int32 {
        CoreCUAGetProcessForPID(pid, process)
    }
    public static func getProcessPID(_ process: UnsafeMutablePointer<ProcessSerialNumber>,
                              pid: UnsafeMutablePointer<Int32>) -> Int32 {
        CoreCUAGetProcessPID(process, pid)
    }
    // Original26d8b4 forwards PSN/windowID/options unchanged to primary slot9.
    public static func setFrontProcess(_ process: UnsafeMutablePointer<ProcessSerialNumber>,
        windowID: UInt32, options: UInt32) -> CGError {
        frontProcess(process, windowID, options)
    }
    public static func setApplicationDesiresAttention(_ process: UnsafeMutablePointer<ProcessSerialNumber>,
        _ desiresAttention: Bool) -> Int32 {
        ApplicationAttentionSPI.setApplicationDesiresAttention(process, desiresAttention)
    }
}
