import AppKit
import Carbon
import CoreGraphics
import AccessibilitySupport

@main struct Check {
    static func main() {
        typealias Options = NSRunningApplication.SetFrontProcessOptions
        precondition(MemoryLayout<Options>.size == 4)
        precondition(Options.allWindows.rawValue == 0x100 && Options.causedByUser.rawValue == 0x200)
        precondition(Options.noWindows.rawValue == 0x400 && Options.dontUnhide.rawValue == 0x800)
        precondition(Options([.allWindows, .causedByUser]).rawValue == 0x300)
        precondition(Options(rawValue: UInt32.max).rawValue == UInt32.max)
        var calls: [String] = []
        let failedLookup = setRunningApplicationFrontProcess(processID: { calls.append("pid"); return 77 },
            windowID: 0, options: Options.allWindows.rawValue,
            getProcess: { pid, process in
                precondition(pid == 77 && process.pointee.highLongOfPSN == 0 && process.pointee.lowLongOfPSN == 0)
                calls.append("lookup"); return -600
            }, setFront: { _, _, _ in preconditionFailure("setter after failed PSN lookup") })
        precondition(!failedLookup && calls == ["pid", "lookup"])
        calls = []
        let result = setRunningApplicationFrontProcess(processID: { calls.append("pid"); return 77 },
            windowID: UInt32.max, options: UInt32.max,
            getProcess: { _, process in
                calls.append("lookup")
                process.pointee = ProcessSerialNumber(highLongOfPSN: 7, lowLongOfPSN: 9); return 0
            }, setFront: { process, window, options in
                calls.append("front")
                precondition(process.pointee.highLongOfPSN == 7 && process.pointee.lowLongOfPSN == 9)
                precondition(window == UInt32.max && options == UInt32.max); return .success
            })
        precondition(result && calls == ["pid", "lookup", "front"])
        let failedSet = setRunningApplicationFrontProcess(processID: { 0 }, windowID: 0,
            options: Options.allWindows.rawValue, getProcess: { _, _ in 0 }, setFront: { _, id, options in
                precondition(id == 0 && options == 0x100); return .failure
            })
        precondition(!failedSet)
        print("AccessibilitySupport front-process options/status/ordering checks passed; no activation")
    }
}

// Original instance APIs compile; never invoke the real activation in fixture.
func checkOriginalRunningApplicationAPIs(_ app: NSRunningApplication) {
    let _: Bool = app.showAllWindows()
    let _: Bool = app.setFrontProcess(windowID: 0, options: [.allWindows, .causedByUser])
}
