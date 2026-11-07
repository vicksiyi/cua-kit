import Foundation

// Native process-wide state at 0x101574958/960. Updated by
// synthesizedActionWasPerformed (0x100745f14), not by arbitrary AX observations.
final class SyntheticFocusActivity {
    static let shared = SyntheticFocusActivity()
    private let lock = NSLock()
    private var lastActionTime = 0.0
    private var lastActionPID: Int32?
    func record(pid: Int32, time: Double) {
        lock.lock(); defer { lock.unlock() }
        lastActionTime = time; lastActionPID = pid
    }
    func snapshot() -> (time: Double, pid: Int32?) {
        lock.lock(); defer { lock.unlock() }
        return (lastActionTime, lastActionPID)
    }
}
