import ApplicationServices
import AppKit

func readAXProcessID(_ element: AXUIElement) throws -> Int32 {
    try providerAXProcessID(element) { try copiedAXProcessID { AXUIElementGetPid(element, &$0) } }
}
func readAXActualProcessID(_ element: AXUIElement) throws -> Int32 {
    try providerAXActualProcessID(element) {
        try copiedAXProcessID { AccessibilitySPI.getActualPID(element, pid: &$0) }
    }
}
func readAXWindowID(_ element: AXUIElement) throws -> UInt32 {
    try providerAXWindowID(element) {
        try copiedAXWindowID { AccessibilitySPI.getWindowID(element, identifier: &$0) }
    }
}
func readAXBundleIdentifier(_ element: AXUIElement) -> String? {
    providerAXBundleIdentifier(element, readPID: { try readAXProcessID(element) },
        applicationBundleIdentifier: { NSRunningApplication(processIdentifier: $0)?.bundleIdentifier })
}
