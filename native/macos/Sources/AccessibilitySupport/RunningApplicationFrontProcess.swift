import AppKit
import Carbon
import CoreGraphics
import SystemSoftware

// Original77b590/77b628: zero PSN, one PID lookup, no setter on lookup error,
// raw window/options forwarding and true only for successful native status.
public func setRunningApplicationFrontProcess(processID: () -> Int32, windowID: UInt32, options: UInt32,
    getProcess: (Int32, UnsafeMutablePointer<ProcessSerialNumber>) -> Int32,
    setFront: (UnsafeMutablePointer<ProcessSerialNumber>, UInt32, UInt32) -> CGError
) -> Bool {
    var process = ProcessSerialNumber(highLongOfPSN: 0, lowLongOfPSN: 0)
    guard getProcess(processID(), &process) == 0 else { return false }
    return setFront(&process, windowID, options) == .success
}

public extension NSRunningApplication {
    struct SetFrontProcessOptions: OptionSet {
        public let rawValue: UInt32
        public init(rawValue: UInt32) { self.rawValue = rawValue }
        public static let allWindows = Self(rawValue: 0x100)
        public static let causedByUser = Self(rawValue: 0x200)
        public static let noWindows = Self(rawValue: 0x400)
        public static let dontUnhide = Self(rawValue: 0x800)
    }

    func showAllWindows() -> Bool {
        setRunningApplicationFrontProcess(processID: { processIdentifier }, windowID: 0,
            options: SetFrontProcessOptions.allWindows.rawValue,
            getProcess: { ApplicationRegistrySPI.getProcessForPID($0, process: $1) },
            setFront: { ApplicationRegistrySPI.setFrontProcess($0, windowID: $1, options: $2) })
    }

    func setFrontProcess(windowID: UInt32, options: SetFrontProcessOptions) -> Bool {
        setRunningApplicationFrontProcess(processID: { processIdentifier }, windowID: windowID,
            options: options.rawValue, getProcess: { ApplicationRegistrySPI.getProcessForPID($0, process: $1) },
            setFront: { ApplicationRegistrySPI.setFrontProcess($0, windowID: $1, options: $2) })
    }
}
