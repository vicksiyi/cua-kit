import Foundation
import ApplicationServices

// Direct system-read branch recovered from the pinned native value(for:).
// PID lookup here uses the OS directly; original MockProvider and
// AXPartialValue truncation metadata are not reconstructed by this adapter.
func onAXAttributeReadThread<Value>(targetPID: pid_t?, read: () -> Value) -> Value {
    if targetPID == getpid() && !Thread.isMainThread {
        return DispatchQueue.main.sync(execute: read)
    }
    return read()
}

func rawAXAttributeResult(copy: (inout CFTypeRef?) -> AXError) -> (error: AXError, value: CFTypeRef?) {
    var value: CFTypeRef?
    let error = copy(&value)
    // Status and output presence are independent in the source contract.
    return (error, value)
}

func readRawAXAttribute(_ element: AXUIElement, _ name: String) -> (error: AXError, value: CFTypeRef?) {
    let targetPID = resolvedAXProcessID(element)
    return onAXAttributeReadThread(targetPID: targetPID) {
        rawAXAttributeResult { AXUIElementCopyAttributeValue(element, name as CFString, &$0) }
    }
}
