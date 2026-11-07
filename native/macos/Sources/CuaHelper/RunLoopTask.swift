import Foundation
import CoreFoundation

// RunLoopTask / RunLoopThread, 0x10077e63c..0x10077edd0.
// Owns a dedicated run loop; releasing the task cancels its thread.
final class RunLoopTask {
    private let thread: RunLoopThread

    init(name: String, qualityOfService: QualityOfService,
         contextObject: AnyObject? = nil,
         configurationHandler: @escaping (CFRunLoop) -> Void) {
        thread = RunLoopThread()
        thread.configurationHandler = configurationHandler
        thread.contextObject = contextObject
        thread.name = name
        thread.qualityOfService = qualityOfService
        thread.start()
    }

    var currentRunLoop: CFRunLoop? { thread.currentRunLoop }

    deinit { thread.cancel() }

    final class RunLoopThread: Thread {
        var configurationHandler: ((CFRunLoop) -> Void)?
        var contextObject: AnyObject?
        private let runLoopLock = NSLock()
        private var runLoop: CFRunLoop?

        var currentRunLoop: CFRunLoop? {
            runLoopLock.lock()
            defer { runLoopLock.unlock() }
            return runLoop
        }

        override func cancel() {
            super.cancel()
            runLoopLock.lock()
            let current = runLoop
            runLoopLock.unlock()
            if let current {
                // Schedule stop on its own thread, then wake it (0x10077ea54).
                CFRunLoopPerformBlock(current, CFRunLoopMode.commonModes.rawValue) {
                    CFRunLoopStop(CFRunLoopGetCurrent())
                }
                CFRunLoopWakeUp(current)
            }
        }

        override func main() {
            let current = CFRunLoopGetCurrent()!
            runLoopLock.lock()
            runLoop = current
            runLoopLock.unlock()
            defer {
                runLoopLock.lock()
                runLoop = nil
                runLoopLock.unlock()
            }
            guard !isCancelled else { return }
            configurationHandler?(current)
            configurationHandler = nil
            // A no-op source keeps an otherwise empty loop alive. Source uses
            // default mode here and common modes for the cancellation block.
            var context = CFRunLoopSourceContext(version: 0, info: nil,
                retain: nil, release: nil, copyDescription: nil, equal: nil,
                hash: nil, schedule: nil, cancel: nil, perform: { _ in })
            let keepAlive = CFRunLoopSourceCreate(nil, 0, &context)!
            CFRunLoopAddSource(current, keepAlive, .defaultMode)
            defer { CFRunLoopSourceInvalidate(keepAlive) }
            while !isCancelled { CFRunLoopRun() }
        }
    }
}
