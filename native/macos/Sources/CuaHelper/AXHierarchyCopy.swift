import Foundation
import ApplicationServices

/// Call routing at 0x1006f80a8 and retained result consumption at 0x1006f8320.
/// Only same-process, off-main reads synchronously dispatch to the main queue.
func copiedAXHierarchy(
    elementPID: pid_t?, currentPID: pid_t, isMainThread: () -> Bool,
    onMain: (() -> AXError) -> AXError,
    copy: @escaping (inout Unmanaged<CFDictionary>?) -> AXError
) -> CFDictionary? {
    var output: Unmanaged<CFDictionary>?
    if elementPID == currentPID && !isMainThread() {
        _ = onMain { copy(&output) }
    } else {
        _ = copy(&output)
    }
    // Both native branches ignore AXError and decode any supplied dictionary.
    // Consume the Copy ownership once, including malformed/empty results.
    return output?.takeRetainedValue()
}

/// PID resolution stays with the caller so the source's MockProvider branch
/// can be restored without replacing it with a hard-coded AXUIElementGetPid.
func copiedAXHierarchy(
    elementPID: pid_t?, copy: @escaping (inout Unmanaged<CFDictionary>?) -> AXError
) -> CFDictionary? {
    copiedAXHierarchy(elementPID: elementPID, currentPID: getpid(),
        isMainThread: { Thread.isMainThread },
        onMain: { DispatchQueue.main.sync(execute: $0) }, copy: copy)
}
