import Foundation
import ApplicationServices

// Direct system-read branch recovered from the pinned native value(for:).
// PID lookup here uses the OS directly; original MockProvider and
// AXPartialValue truncation metadata are not reconstructed by this adapter.
func onAXAttributeReadThread<Value>(targetPID: pid_t?, read: () throws -> Value) rethrows -> Value {
    if targetPID == getpid() && !Thread.isMainThread {
        return try DispatchQueue.main.sync(execute: read)
    }
    return try read()
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

// Unlike an ordinary attribute read, the parameterized system-call branch at
// 0x1006f7098 rejects every non-success status, even with a non-nil output.
// Successful nil remains nil. MockProvider and AXPartialValue metadata are
// separate layers, not synthesized by this direct system adapter.
func rawAXParameterizedAttributeResult(copy: (inout CFTypeRef?) -> AXError) throws -> CFTypeRef? {
    var value: CFTypeRef?
    let error = copy(&value)
    guard error == .success else { throw UIElementError.axError(error) }
    return value
}

func readRawAXParameterizedAttribute(_ element: AXUIElement, _ name: String, parameter: CFTypeRef) throws -> CFTypeRef? {
    let targetPID = resolvedAXProcessID(element)
    return try onAXAttributeReadThread(targetPID: targetPID) {
        try rawAXParameterizedAttributeResult {
            AXUIElementCopyParameterizedAttributeValue(element, name as CFString, parameter, &$0)
        }
    }
}

// Attribute-name enumeration differs from parameterized value reads: the
// original system branch at 0x1006f5d04 ignores AXError and consumes the output.
// Keep the raw CFArray here; MockProvider, array bridging and conversion to
// UIElementAttribute belong to the still-separate supported-attributes layer.
func rawAXAttributeNamesResult(copy: (inout CFArray?) -> AXError) -> CFArray? {
    var names: CFArray?
    _ = copy(&names)
    return names
}

func readRawAXAttributeNames(_ element: AXUIElement) -> CFArray? {
    let targetPID = resolvedAXProcessID(element)
    return onAXAttributeReadThread(targetPID: targetPID) {
        rawAXAttributeNamesResult { AXUIElementCopyAttributeNames(element, &$0) }
    }
}

// Supported-attribute enumeration conditionally bridges the whole NSArray to
// [CFString] using Foundation, falling back to an empty array. Preserve that
// standard-library boundary instead of filtering individual CF type IDs.
func decodedAXAttributeNames(_ names: CFArray?) -> [CFString] {
    guard let names else { return [] }
    return names as? [CFString] ?? []
}
